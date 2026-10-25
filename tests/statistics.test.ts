import { describe, it, expect } from 'vitest';
import { statistics } from '../src/lib/statistics';
import { score, dimensions } from '../src/lib/scoring';
import type { Answers } from '../src/lib/questions';
const row = (answers: Answers, id = 'a') => ({
  id,
  created_at: '2026-10-23T17:00:00.000Z',
  answers,
  scoring: score(answers),
});
describe('统计与导出', () => {
  it('C 单选题按有效作答人数计算选项占比', () => {
    const s = statistics([
      row({ C01: { choices: ['A'] } }),
      row({ C01: { choices: ['B'] } }),
      row({}),
    ]);
    const c = s.cQuestionStats.find((q) => q.id === 'C01')!;
    expect(c).toMatchObject({ valid: 2, missing: 1, multiple: false });
    expect(c.options.find((o) => o.value === 'A')).toMatchObject({ count: 1, percent: 50 });
    expect(c.options.find((o) => o.value === 'B')).toMatchObject({ count: 1, percent: 50 });
  });
  it('C 多选题逐项统计，比例可合计超过 100%', () => {
    const s = statistics([row({ C02: { choices: ['A', 'B'] } }), row({ C02: { choices: ['A'] } })]);
    const c = s.cQuestionStats.find((q) => q.id === 'C02')!;
    expect(c).toMatchObject({ valid: 2, multiple: true });
    expect(c.options.find((o) => o.value === 'A')).toMatchObject({ count: 2, percent: 100 });
    expect(c.options.find((o) => o.value === 'B')).toMatchObject({ count: 1, percent: 50 });
  });
  it('倾向分母排除资料不足记录', () => {
    const answers = Object.fromEntries(
      dimensions[0].ids.map((id) => [id, { choices: ['4'] }]),
    ) as Answers;
    const s = statistics([row(answers), row({})]);
    expect(s.tendencyStats[0]).toMatchObject({
      valid: 1,
      evident: 1,
      evidentPercent: 100,
      dominantPercent: 100,
      insufficient: 1,
    });
    expect(s.tendencyStats[0].bins[3].count).toBe(1);
  });
  it('UTC转北京时间归档', () => expect(statistics([row({})]).timeline[0].date).toBe('2026-10-24'));
  it('空数据安全，不产生NaN', () => {
    const s = statistics([]);
    expect(JSON.stringify(s)).not.toContain('NaN');
    expect(s.tendencyStats[0].mean).toBeNull();
  });
});
