import { questions } from './questions';
import { dimensions } from './scoring';
import type { ResponseRow } from './server/database';
export const percentage = (count: number, total: number) => (total ? (count / total) * 100 : 0);
export function statistics(rows: ResponseRow[]) {
  const cQuestionStats = questions
    .filter((q) => q.id.startsWith('C'))
    .map((q) => {
      const valid = rows.filter((r) => r.answers[q.id]?.choices.length).length;
      return {
        id: q.id,
        title: q.title,
        multiple: q.multiple,
        valid,
        missing: rows.length - valid,
        options: q.options.map((o) => {
          const count = rows.filter((r) => r.answers[q.id]?.choices.includes(o.value)).length;
          return { value: o.value, label: o.label, count, percent: percentage(count, valid) };
        }),
      };
    });
  const tendencyStats = dimensions.map((d) => {
    const eligible = rows.filter(
      (r) => r.scoring.dimensions.find((x) => x.name === d.name)?.sufficient,
    );
    const evident = eligible.filter(
      (r) => r.scoring.dimensions.find((x) => x.name === d.name)?.evident,
    ).length;
    const dominant = eligible.filter((r) => r.scoring.dominant === d.name).length;
    const companion = eligible.filter((r) =>
      r.scoring.companions.includes(d.name === '低关注' ? '伴随低关注特征' : d.name),
    ).length;
    const scores = eligible.map((r) => r.scoring.dimensions.find((x) => x.name === d.name)!.mean!);
    const bins = [1, 2, 3, 4].map((n, i) => ({
      label: i === 3 ? '4.0—5.0' : `${n}.0—<${n + 1}.0`,
      count: scores.filter((s) => s >= n && (i === 3 ? s <= 5 : s < n + 1)).length,
    }));
    return {
      name: d.name,
      valid: eligible.length,
      insufficient: rows.length - eligible.length,
      evident,
      evidentPercent: percentage(evident, eligible.length),
      dominant,
      dominantPercent: percentage(dominant, eligible.length),
      companion,
      companionPercent: percentage(companion, eligible.length),
      mean: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      bins,
    };
  });
  const times: Record<string, number> = {};
  rows.forEach((r) => {
    const date = new Date(r.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    times[date] = (times[date] || 0) + 1;
  });
  return {
    total: rows.length,
    unclear: rows.filter((r) => r.scoring.dominant === '主导倾向不明确').length,
    insufficient: rows.filter((r) => r.scoring.insufficient.length).length,
    review: rows.filter((r) => r.scoring.needsReview).length,
    cQuestionStats,
    tendencyStats,
    timeline: Object.entries(times)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
  };
}
export type Statistics = ReturnType<typeof statistics>;
