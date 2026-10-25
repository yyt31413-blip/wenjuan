import { ServiceError } from '@/lib/server/database';
import { login } from '@/lib/server/auth';
import { json, failure, readJson, checkOrigin } from '@/lib/server/http';
export async function POST(request: Request) {
  try {
    await checkOrigin(request);
    const body = await readJson(request, 4000);
    if (
      !body ||
      typeof body.email !== 'string' ||
      typeof body.password !== 'string' ||
      !body.email ||
      !body.password ||
      body.email.length > 254 ||
      body.password.length > 1024
    )
      throw new ServiceError('请输入有效的邮箱和密码。', 400);
    await login(body.email, body.password);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
