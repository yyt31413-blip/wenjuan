import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import type { D1Database } from '@cloudflare/workers-types';
const state = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  jar: new Map<string, string>(),
  set: vi.fn(),
}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: state.env }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { value: state.jar.get(name)! } : undefined),
    set: (name: string, value: string, options: unknown) => {
      state.jar.set(name, value);
      state.set(name, value, options);
    },
    delete: (name: string) => state.jar.delete(name),
  }),
}));
import { saveResponse, listResponses } from '../src/lib/server/database';
import { login, requireAdmin, clearSession } from '../src/lib/server/auth';
import { POST as submit } from '../src/app/api/responses/route';
import { GET as adminData } from '../src/app/api/admin/data/route';
import { questions } from '../src/lib/questions';
import { score } from '../src/lib/scoring';

let mf: Miniflare, db: D1Database;
const root = resolve('.local-tests'),
  persist = join(root, 'd1-' + crypto.randomUUID());
const password = randomBytes(24).toString('hex'),
  salt = randomBytes(16).toString('hex');
const passwordHash =
  'scrypt$16384$8$5$' +
  salt +
  '$' +
  scryptSync(password, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }).toString(
    'hex',
  );
const answers = { A01: { choices: ['A'] }, B01: { choices: ['5'] } };
async function start() {
  mf = new Miniflare({
    ...convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      compatibilityDate: '2026-10-19',
      d1Databases: { DB: 'isolated-survey-test' },
    }),
    resourcePersistencePath: persist,
  });
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  state.env = {
    DB: db,
    APP_ORIGIN: 'http://localhost:3000',
    ADMIN_EMAIL: 'admin@test.invalid',
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: 'a'.repeat(64),
  };
}
beforeAll(async () => {
  mkdirSync(root, { recursive: true });
  await start();
  const sql = readFileSync('migrations/0001_initial.sql', 'utf8');
  await db.batch(
    sql
      .split(';')
      .filter((s) => s.trim())
      .map((s) => db.prepare(s)),
  );
}, 30000);
beforeEach(async () => {
  state.jar.clear();
  state.set.mockClear();
  state.env.ADMIN_PASSWORD_HASH = passwordHash;
  state.env.APP_ORIGIN = 'http://localhost:3000';
  await db.batch(
    ['survey_responses', 'admin_sessions', 'admin_login_attempts'].map((t) =>
      db.prepare('DELETE FROM ' + t),
    ),
  );
});
afterAll(async () => {
  await mf?.dispose();
  if (persist.startsWith(root + '\\')) rmSync(persist, { recursive: true, force: true });
});

describe('real local D1, no cloud account or mock database', () => {
  it('five concurrent retries persist one immutable record', async () => {
    const key = crypto.randomUUID();
    const ids = await Promise.all(Array.from({ length: 5 }, () => saveResponse(key, answers)));
    expect(new Set(ids).size).toBe(1);
    await saveResponse(key, { A01: { choices: ['A'] } });
    const rows = await listResponses();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: ids[0], answers, scoring: score(answers) });
  });
  it('disk data survives restarting the local D1 runtime', async () => {
    const id = await saveResponse(crypto.randomUUID(), answers);
    await mf.dispose();
    await start();
    expect((await listResponses())[0]).toMatchObject({ id, answers });
  });
  it('pagination returns all 505 rows once even with identical times', async () => {
    for (let n = 0; n < 505; n += 100) {
      await db.batch(
        Array.from({ length: Math.min(100, 505 - n) }, (_, i) =>
          db
            .prepare(
              'INSERT INTO survey_responses (id,submission_hash,created_at,version,answers,scoring) VALUES (?,?,?,?,?,?)',
            )
            .bind(
              crypto.randomUUID(),
              String(n + i).padStart(64, '0'),
              '2026-10-24T00:00:00.000Z',
              score(answers).version,
              JSON.stringify(answers),
              JSON.stringify(score(answers)),
            ),
        ),
      );
    }
    const rows = await listResponses();
    expect(rows).toHaveLength(505);
    expect(new Set(rows.map((r) => r.id)).size).toBe(505);
  });
  it('route validates and saves in D1 without disclosing scores', async () => {
    const response = await submit(
      new Request('http://localhost:3000/api/responses', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionKey: crypto.randomUUID(),
          answers: Object.fromEntries(
            questions.map((q) => [q.id, { choices: [q.options[0].value] }]),
          ),
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(Object.keys(await response.json()).sort()).toEqual(['id', 'saved']);
    expect(await listResponses()).toHaveLength(1);
  });
  it('wrong password and fabricated session are rejected', async () => {
    await expect(login('admin@test.invalid', 'wrong')).rejects.toMatchObject({ status: 401 });
    state.jar.set('survey-admin-session', 'f'.repeat(64));
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });
  it('login sets HttpOnly cookie; logout revokes replayed session', async () => {
    await login('admin@test.invalid', password);
    expect(await requireAdmin()).toEqual({ email: 'admin@test.invalid' });
    expect(state.set).toHaveBeenCalledWith(
      'survey-admin-session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', secure: false }),
    );
    const token = state.jar.get('survey-admin-session')!;
    const row = await db
      .prepare('SELECT token_hash FROM admin_sessions')
      .first<{ token_hash: string }>();
    expect(row?.token_hash).not.toBe(token);
    await clearSession();
    state.jar.set('survey-admin-session', token);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });
  it('expired sessions and rotated credentials invalidate access', async () => {
    await login('admin@test.invalid', password);
    await db.prepare('UPDATE admin_sessions SET expires_at=0').run();
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
    await login('admin@test.invalid', password);
    state.env.ADMIN_PASSWORD_HASH =
      passwordHash.slice(0, -1) + (passwordHash.endsWith('0') ? '1' : '0');
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });
  it('HTTPS enables Secure cookie', async () => {
    state.env.APP_ORIGIN = 'https://survey.example';
    await login('admin@test.invalid', password);
    expect(state.set).toHaveBeenCalledWith(
      'survey-admin-session',
      expect.any(String),
      expect.objectContaining({ secure: true }),
    );
  });
  it('D1 enforces persistent login attempt limit', async () => {
    const bucket = Math.floor(Date.now() / 1000 / 900);
    await db
      .prepare('INSERT INTO admin_login_attempts (bucket,attempts) VALUES (?,10)')
      .bind(bucket)
      .run();
    await expect(login('another@test.invalid', password)).rejects.toMatchObject({ status: 429 });
  });
  it('admin data endpoint returns aggregates without raw answers', async () => {
    await saveResponse(crypto.randomUUID(), { ...answers, C01: { choices: ['A'] } });
    await login('admin@test.invalid', password);
    const response = await adminData();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stats.total).toBe(1);
    expect(
      body.stats.cQuestionStats.find((q: { id: string }) => q.id === 'C01').options[0],
    ).toMatchObject({ count: 1, percent: 100 });
    expect(body).not.toHaveProperty('latest');
    expect(body).not.toHaveProperty('reviews');
    expect(body).not.toHaveProperty('responses');
    expect(JSON.stringify(body)).not.toContain('"answers"');
  });
});
