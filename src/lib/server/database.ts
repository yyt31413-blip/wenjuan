import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { Answers } from '../questions';
import { score, type Score } from '../scoring';
import { environment } from './cloudflare';
import { ServiceError } from './errors';
export { ServiceError } from './errors';
export async function database() {
  const { DB } = await environment();
  if (!DB) throw new ServiceError('D1 数据库尚未绑定；您的答案已保留。', 503);
  return DB;
}
export type ResponseRow = { id: string; created_at: string; answers: Answers; scoring: Score };
type StoredResponse = { id: string; created_at: string; answers: string; scoring: string };
export async function saveResponse(submissionKey: string, answers: Answers) {
  const db = await database(),
    hash = createHash('sha256').update(submissionKey).digest('hex'),
    scoring = score(answers);
  try {
    // D1 batch is a transaction. Retries cannot overwrite the first saved answer.
    const results = await db.batch([
      db
        .prepare(
          `INSERT INTO survey_responses (id, submission_hash, created_at, version, answers, scoring)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(submission_hash) DO NOTHING`,
        )
        .bind(
          randomUUID(),
          hash,
          new Date().toISOString(),
          scoring.version,
          JSON.stringify(answers),
          JSON.stringify(scoring),
        ),
      db.prepare('SELECT id FROM survey_responses WHERE submission_hash = ?').bind(hash),
    ]);
    const id = (results[1].results[0] as { id?: string } | undefined)?.id;
    if (!id) throw new Error('Missing saved row');
    return id;
  } catch {
    throw new ServiceError('D1 未确认保存成功。答案已保留，请稍后重试。', 503);
  }
}
export async function listResponses(): Promise<ResponseRow[]> {
  const db = await database(),
    result: ResponseRow[] = [];
  try {
    // Immutable sequence bounds prevent concurrent submissions from shifting pagination.
    const upper = await db
      .prepare('SELECT COALESCE(MAX(seq), 0) AS n FROM survey_responses')
      .first<number>('n');
    let cursor = (upper ?? 0) + 1;
    for (;;) {
      const rows = await db
        .prepare(
          `SELECT seq, id, created_at, answers, scoring FROM survey_responses
        WHERE seq < ? ORDER BY seq DESC LIMIT 500`,
        )
        .bind(cursor)
        .all<StoredResponse & { seq: number }>();
      result.push(
        ...rows.results.map(({ id, created_at, answers, scoring }) => ({
          id,
          created_at,
          answers: JSON.parse(answers),
          scoring: JSON.parse(scoring),
        })),
      );
      if (rows.results.length < 500) break;
      cursor = rows.results[rows.results.length - 1].seq;
    }
    return result;
  } catch {
    throw new ServiceError('无法读取答卷，请检查 D1 绑定与迁移。', 503);
  }
}
