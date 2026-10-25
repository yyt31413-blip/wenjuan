import { requireAdmin } from '@/lib/server/auth';
import { listResponses } from '@/lib/server/database';
import { statistics } from '@/lib/statistics';
import { json, failure } from '@/lib/server/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await requireAdmin();
    const responses = await listResponses();
    return json({
      stats: statistics(responses),
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return failure(e);
  }
}
