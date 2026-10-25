import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { database, ServiceError } from './database';
import { environment, appOrigin } from './cloudflare';
import { validPasswordHash, verifyPassword } from './password';
const cookieName = 'survey-admin-session',
  lifetime = 8 * 60 * 60;
async function credentials() {
  const env = await environment();
  if (
    !env.ADMIN_EMAIL ||
    !env.ADMIN_PASSWORD_HASH ||
    !validPasswordHash(env.ADMIN_PASSWORD_HASH) ||
    !env.SESSION_SECRET ||
    env.SESSION_SECRET.length < 64
  )
    throw new ServiceError('管理员尚未配置，请先完成本地初始化或设置 Worker Secrets。', 503);
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const digest = (value: string) =>
    createHmac('sha256', env.SESSION_SECRET!).update(value).digest('hex');
  return {
    email,
    passwordHash: env.ADMIN_PASSWORD_HASH,
    digest,
    version: digest(email + '\n' + env.ADMIN_PASSWORD_HASH),
  };
}
export async function login(email: string, password: string) {
  const c = await credentials(),
    db = await database(),
    now = Math.floor(Date.now() / 1000),
    bucket = Math.floor(now / 900);
  // Account-wide persistent throttling covers attempts with fabricated email addresses too.
  const attempts = await db
    .prepare(
      `INSERT INTO admin_login_attempts (bucket, attempts) VALUES (?, 1)
    ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`,
    )
    .bind(bucket)
    .first<number>('attempts');
  if (!attempts || attempts > 10)
    throw new ServiceError('登录尝试过于频繁，请在 15 分钟后重试。', 429);
  const matches = await verifyPassword(password, c.passwordHash);
  if (!matches || email.trim().toLowerCase() !== c.email)
    throw new ServiceError('登录失败，请检查邮箱和密码。', 401);
  const token = randomBytes(32).toString('hex');
  await db.batch([
    db
      .prepare('DELETE FROM admin_sessions WHERE expires_at <= ? OR credential_version <> ?')
      .bind(now, c.version),
    db.prepare('DELETE FROM admin_login_attempts WHERE bucket < ?').bind(bucket - 1),
    db
      .prepare(
        'INSERT INTO admin_sessions (token_hash, credential_version, expires_at) VALUES (?, ?, ?)',
      )
      .bind(c.digest(token), c.version, now + lifetime),
  ]);
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: (await appOrigin()).startsWith('https:'),
    path: '/',
    maxAge: lifetime,
  });
}
export async function requireAdmin() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ServiceError('请先登录管理员账号。', 401);
  const c = await credentials(),
    db = await database();
  const found = await db
    .prepare(
      `SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND credential_version = ? AND expires_at > ?`,
    )
    .bind(c.digest(token), c.version, Math.floor(Date.now() / 1000))
    .first();
  if (!found) throw new ServiceError('登录已过期，请重新登录。', 401);
  return { email: c.email };
}
export async function clearSession() {
  const jar = await cookies(),
    token = jar.get(cookieName)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const c = await credentials();
    await (
      await database()
    )
      .prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
      .bind(c.digest(token))
      .run();
  }
  jar.delete(cookieName);
}
