import { saveResponse } from '@/lib/server/database';
import { validateSubmission } from '@/lib/validation';
import { json, failure, readJson, checkOrigin } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    await checkOrigin(request);
    const { submissionKey, answers } = validateSubmission(await readJson(request));
    const id = await saveResponse(submissionKey, answers);
    return json({ saved: true, id }, 201);
  } catch (e) {
    return failure(e);
  }
}
