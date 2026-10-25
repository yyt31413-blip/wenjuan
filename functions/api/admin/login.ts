import { checkOrigin, failure, json, login, readJson, ServiceError, type Context } from '../../_shared/core';

export async function onRequestPost(context: Context) {
  try {
    checkOrigin(context.request, context.env);
    const body = await readJson(context.request, 4000);
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string'
      || !body.email || !body.password || body.email.length > 254 || body.password.length > 1024)
      throw new ServiceError('请输入有效的邮箱和密码。', 400);
    const cookie = await login(context.env, body.email, body.password);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie });
  } catch (error) {
    return failure(error);
  }
}
