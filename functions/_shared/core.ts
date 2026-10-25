import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { D1Database } from '@cloudflare/workers-types';
import type { Answers } from '../../src/lib/questions';
import { score, type Score } from '../../src/lib/scoring';
import { ValidationError } from '../../src/lib/validation';
import { validPasswordHash, verifyPassword } from '../../src/lib/server/password';

export type Env = {
  DB?: D1Database;
  APP_ORIGIN?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
};
export type Context = { request: Request; env: Env };
export type ResponseRow = { id: string; created_at: string; answers: Answers; scoring: Score };
type StoredResponse = { seq: number; id: string; created_at: string; answers: string; scoring: string };
const cookieName = 'survey-admin-session';
const lifetime = 8 * 60 * 60;

export class ServiceError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store, private');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(JSON.stringify(data), { status, headers });
}

export function failure(error: unknown) {
  if (error instanceof ServiceError) return json({ error: error.message }, error.status);
  if (error instanceof ValidationError || error instanceof SyntaxError)
    return json({ error: error instanceof SyntaxError ? '请求内容格式不正确。' : error.message }, 400);
  console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
  return json({ error: '服务暂时不可用，请稍后重试。' }, 500);
}

export function appOrigin(env: Env) {
  if (!env.APP_ORIGIN) throw new ServiceError('网站来源尚未配置。', 503);
  let url: URL;
  try {
    url = new URL(env.APP_ORIGIN);
  } catch {
    throw new ServiceError('网站来源配置无效。', 503);
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  ) throw new ServiceError('正式网站必须使用 HTTPS。', 503);
  return url.origin;
}

export function checkOrigin(request: Request, env: Env) {
  if (!request.headers.get('origin') || request.headers.get('origin') !== appOrigin(env))
    throw new ServiceError('请求来源不受信任。', 403);
}

export async function readJson(request: Request, limit = 32000) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ServiceError('请使用 JSON 请求。', 415);
  if (Number(request.headers.get('content-length') || 0) > limit)
    throw new ServiceError('提交内容过大。', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError('请求不能为空。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new ServiceError('提交内容过大。', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function database(env: Env) {
  if (!env.DB) throw new ServiceError('D1 数据库尚未绑定；您的答案已保留。', 503);
  return env.DB;
}

export async function saveResponse(env: Env, submissionKey: string, answers: Answers) {
  const db = database(env);
  const hash = createHash('sha256').update(submissionKey).digest('hex');
  const scoring = score(answers);
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO survey_responses (id, submission_hash, created_at, version, answers, scoring)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(submission_hash) DO NOTHING`).bind(
        randomUUID(), hash, new Date().toISOString(), scoring.version,
        JSON.stringify(answers), JSON.stringify(scoring),
      ),
      db.prepare('SELECT id FROM survey_responses WHERE submission_hash = ?').bind(hash),
    ]);
    const id = (results[1].results[0] as { id?: string } | undefined)?.id;
    if (!id) throw new Error('Missing saved row');
    return id;
  } catch {
    throw new ServiceError('D1 未确认保存成功。答案已保留，请稍后重试。', 503);
  }
}

export async function listResponses(env: Env): Promise<ResponseRow[]> {
  const db = database(env);
  const result: ResponseRow[] = [];
  try {
    const upper = await db.prepare('SELECT COALESCE(MAX(seq), 0) AS n FROM survey_responses').first<number>('n');
    let cursor = (upper ?? 0) + 1;
    for (;;) {
      const rows = await db.prepare(`SELECT seq, id, created_at, answers, scoring FROM survey_responses
        WHERE seq < ? ORDER BY seq DESC LIMIT 500`).bind(cursor).all<StoredResponse>();
      result.push(...rows.results.map(({ id, created_at, answers, scoring }) => ({
        id, created_at, answers: JSON.parse(answers), scoring: JSON.parse(scoring),
      })));
      if (rows.results.length < 500) break;
      cursor = rows.results[rows.results.length - 1].seq;
    }
    return result;
  } catch {
    throw new ServiceError('无法读取答卷，请检查 D1 绑定与迁移。', 503);
  }
}

function credentials(env: Env) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH || !validPasswordHash(env.ADMIN_PASSWORD_HASH)
    || !env.SESSION_SECRET || env.SESSION_SECRET.length < 64)
    throw new ServiceError('管理员尚未配置，请先设置 Pages Secrets。', 503);
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const digest = (value: string) => createHmac('sha256', env.SESSION_SECRET!).update(value).digest('hex');
  return { email, passwordHash: env.ADMIN_PASSWORD_HASH, digest,
    version: digest(email + '\n' + env.ADMIN_PASSWORD_HASH) };
}

export async function login(env: Env, email: string, password: string) {
  const c = credentials(env);
  const db = database(env);
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / 900);
  const attempts = await db.prepare(`INSERT INTO admin_login_attempts (bucket, attempts) VALUES (?, 1)
    ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`)
    .bind(bucket).first<number>('attempts');
  if (!attempts || attempts > 10)
    throw new ServiceError('登录尝试过于频繁，请在 15 分钟后重试。', 429);
  if (!(await verifyPassword(password, c.passwordHash)) || email.trim().toLowerCase() !== c.email)
    throw new ServiceError('登录失败，请检查邮箱和密码。', 401);
  const token = randomBytes(32).toString('hex');
  await db.batch([
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ? OR credential_version <> ?').bind(now, c.version),
    db.prepare('DELETE FROM admin_login_attempts WHERE bucket < ?').bind(bucket - 1),
    db.prepare('INSERT INTO admin_sessions (token_hash, credential_version, expires_at) VALUES (?, ?, ?)')
      .bind(c.digest(token), c.version, now + lifetime),
  ]);
  return `${cookieName}=${token}; Max-Age=${lifetime}; Path=/; HttpOnly; SameSite=Strict${appOrigin(env).startsWith('https:') ? '; Secure' : ''}`;
}

function sessionToken(request: Request) {
  const cookie = request.headers.get('cookie')?.split(';').map((entry) => entry.trim())
    .find((entry) => entry.startsWith(cookieName + '='));
  const token = cookie?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function requireAdmin(context: Context) {
  const token = sessionToken(context.request);
  if (!token) throw new ServiceError('请先登录管理员账号。', 401);
  const c = credentials(context.env);
  const found = await database(context.env).prepare(
    'SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND credential_version = ? AND expires_at > ?',
  ).bind(c.digest(token), c.version, Math.floor(Date.now() / 1000)).first();
  if (!found) throw new ServiceError('登录已过期，请重新登录。', 401);
}

export async function clearSession(context: Context) {
  const token = sessionToken(context.request);
  if (token) {
    const c = credentials(context.env);
    await database(context.env).prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
      .bind(c.digest(token)).run();
  }
  return `${cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${appOrigin(context.env).startsWith('https:') ? '; Secure' : ''}`;
}
