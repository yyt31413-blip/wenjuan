import { clearSession } from '@/lib/server/auth';
import { json, failure, checkOrigin } from '@/lib/server/http';
export async function POST(request: Request) {
  try {
    await checkOrigin(request);
    await clearSession();
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
