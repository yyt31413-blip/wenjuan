import { statistics } from '../../../src/lib/statistics';
import { failure, json, listResponses, requireAdmin, type Context } from '../../_shared/core';

export async function onRequestGet(context: Context) {
  try {
    await requireAdmin(context);
    return json({ stats: statistics(await listResponses(context.env)), generatedAt: new Date().toISOString() });
  } catch (error) {
    return failure(error);
  }
}
