import { checkOrigin, clearSession, failure, json, type Context } from '../../_shared/core';

export async function onRequestPost(context: Context) {
  try {
    checkOrigin(context.request, context.env);
    return json({ ok: true }, 200, { 'Set-Cookie': await clearSession(context) });
  } catch (error) {
    return failure(error);
  }
}
