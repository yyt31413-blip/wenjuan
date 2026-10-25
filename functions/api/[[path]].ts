import { json } from '../_shared/core';

export function onRequest() {
  return json({ error: '接口不存在。' }, 404);
}
