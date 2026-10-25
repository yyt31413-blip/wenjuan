import { validateSubmission } from '../../src/lib/validation';
import { checkOrigin, failure, json, readJson, saveResponse, type Context } from '../_shared/core';

export async function onRequestPost(context: Context) {
  try {
    checkOrigin(context.request, context.env);
    const { submissionKey, answers } = validateSubmission(await readJson(context.request));
    return json({ saved: true, id: await saveResponse(context.env, submissionKey, answers) }, 201);
  } catch (error) {
    return failure(error);
  }
}
