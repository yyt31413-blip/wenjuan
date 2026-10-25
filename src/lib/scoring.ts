import type { Answers } from './questions';
export const dimensions = [
  { name: '视觉规则', ids: ['B01', 'B10', 'B15', 'B24', 'B28'], min: 4 },
  { name: '分类秩序', ids: ['B03', 'B07', 'B18', 'B20', 'B27'], min: 4 },
  { name: '功能效率', ids: ['B02', 'B12', 'B14', 'B21', 'B25'], min: 4 },
  { name: '个人逻辑', ids: ['B04', 'B08', 'B17', 'B19', 'B29'], min: 4 },
  { name: '动态容错', ids: ['B05', 'B11', 'B13', 'B22', 'B26', 'B30'], min: 5 },
  { name: '低关注', ids: ['B06', 'B09', 'B16', 'B23'], min: 3 },
] as const;
export type DimensionName = (typeof dimensions)[number]['name'];
function summarize(ids: readonly string[], answers: Answers) {
  const values = ids
    .map((id) => answers[id]?.choices[0])
    .filter((s): s is string => !!s && /^[1-5]$/.test(s))
    .map(Number);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    sum,
    count: values.length,
    mean: values.length ? sum / values.length : null,
    high: values.filter((v) => v >= 4).length,
  };
}
export function score(answers: Answers) {
  const results = dimensions.map((d) => {
    const s = summarize(d.ids, answers);
    const groups =
      d.name === '动态容错'
        ? [summarize(d.ids.slice(0, 3), answers), summarize(d.ids.slice(3), answers)]
        : [];
    const sufficient = s.count >= d.min && groups.every((g) => g.count >= 2);
    const evident =
      sufficient &&
      s.mean !== null &&
      (d.name === '动态容错'
        ? s.mean >= 3.6 && groups.every((g) => g.mean !== null && g.mean >= 3.5 && g.high >= 2)
        : s.mean >= (d.name === '低关注' ? 4 : 3.6) && s.high >= 3);
    return { name: d.name, ...s, sufficient, evident: sufficient ? evident : null, groups };
  });
  const main = results.slice(0, 5).filter((d) => d.evident);
  const low = results[5].evident === true;
  const max = Math.max(...main.map((d) => d.mean!));
  const tied = main.filter((d) => Math.abs(d.mean! - max) < 1e-10).map((d) => d.name);
  const needsReview = tied.length > 1;
  const dominant = needsReview ? '并列待复核' : (tied[0] ?? (low ? '低关注' : '主导倾向不明确'));
  const companions: string[] = main.filter((d) => !tied.includes(d.name)).map((d) => d.name);
  if (low && main.length) companions.push('伴随低关注特征');
  const insufficient = results.filter((d) => !d.sufficient).map((d) => d.name);
  return {
    version: '1.0.0',
    dimensions: results,
    dominant,
    companions,
    tied: needsReview ? tied : [],
    insufficient,
    needsReview,
    provisional: insufficient.length > 0,
  };
}
export type Score = ReturnType<typeof score>;
