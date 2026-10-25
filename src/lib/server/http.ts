import { NextResponse } from 'next/server';
import { ServiceError } from './database';
import { ValidationError } from '../validation';
import { appOrigin } from './cloudflare';
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
export function failure(e: unknown) {
  if (e instanceof ServiceError) return json({ error: e.message }, e.status);
  if (e instanceof ValidationError || e instanceof SyntaxError)
    return json({ error: e instanceof SyntaxError ? '请求内容格式不正确。' : e.message }, 400);
  console.error('Request failed:', e instanceof Error ? e.name : 'UnknownError');
  return json({ error: '服务暂时不可用，请稍后重试。' }, 500);
}
export async function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = await appOrigin();
  // 只允许本网站发起的浏览器写请求；生产必须显式配置 APP_ORIGIN。
  if (!origin || origin !== expected) throw new ServiceError('请求来源不受信任。', 403);
}
export async function readJson(request: Request, limit = 32000) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ServiceError('请使用 JSON 请求。', 415);
  if (Number(request.headers.get('content-length') || 0) > limit)
    throw new ServiceError('提交内容过大。', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError('请求不能为空。');
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
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
  let n = 0;
  for (const c of chunks) {
    bytes.set(c, n);
    n += c.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
