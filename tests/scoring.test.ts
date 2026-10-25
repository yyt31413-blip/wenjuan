import { describe, it, expect } from 'vitest';
import { score, dimensions } from '../src/lib/scoring';
import type { Answers } from '../src/lib/questions';
function base(n = '1'): Answers {
  return Object.fromEntries(dimensions.flatMap((d) => d.ids.map((id) => [id, { choices: [n] }])));
}
function fill(a: Answers, index: number, values: string[]) {
  dimensions[index].ids.forEach((id, i) => (a[id] = { choices: [values[i] ?? 'X'] }));
  return a;
}
describe('六维度计分', () => {
  it('全部低分主导不明确', () => {
    const s = score(base());
    expect(s.dominant).toBe('主导倾向不明确');
    expect(s.insufficient).toEqual([]);
  });
  it('X 和缺失不按0分，保留资料不足状态', () => {
    const s = score({ B01: { choices: ['4'] }, B10: { choices: ['X'] } });
    expect(s.dimensions[0]).toMatchObject({
      mean: 4,
      count: 1,
      high: 1,
      evident: null,
      sufficient: false,
    });
    expect(s.insufficient).toHaveLength(6);
  });
  it('普通维度至少4题，均分3.6且三题高分', () => {
    expect(score(fill(base(), 0, ['4', '4', '4', '3', '3'])).dimensions[0].evident).toBe(true);
    expect(score(fill(base(), 0, ['5', '5', '3', '3', '3'])).dimensions[0].evident).toBe(false);
    expect(score(fill(base(), 0, ['5', '5', '5', 'X', 'X'])).dimensions[0].evident).toBeNull();
  });
  it('4道有效题取均分，不比较总分', () => {
    const s = score(fill(base(), 0, ['4', '4', '4', '4', 'X']));
    expect(s.dominant).toBe('视觉规则');
    expect(s.dimensions[0].mean).toBe(4);
  });
  it('动态维度要求5题且两组有效题数>=2', () => {
    expect(score(fill(base(), 4, ['5', '5', '5', '5', 'X', 'X'])).dimensions[4].evident).toBeNull();
    expect(score(fill(base(), 4, ['4', '4', 'X', '4', '4', '4'])).dimensions[4].evident).toBe(true);
  });
  it('动态维度两组均分与高分数量独立限制', () => {
    expect(score(fill(base(), 4, ['5', '5', '5', '3', '3', '3'])).dimensions[4].evident).toBe(
      false,
    );
    expect(score(fill(base(), 4, ['5', '3', '3', '5', '5', '5'])).dimensions[4].evident).toBe(
      false,
    );
    expect(score(fill(base(), 4, ['4', '4', '3', '4', '4', '3'])).dimensions[4].evident).toBe(true);
  });
  it('低关注阈值4.0，至少3个高分', () => {
    expect(score(fill(base(), 5, ['4', '4', '4', '3'])).dimensions[5].evident).toBe(false);
    expect(score(fill(base(), 5, ['4', '4', '4', 'X'])).dominant).toBe('低关注');
    expect(score(fill(base(), 5, ['5', '5', 'X', 'X'])).dimensions[5].evident).toBeNull();
  });
  it('最高主要倾向为主导，其余伴随', () => {
    let a = fill(base(), 0, ['5', '4', '4', '4', '4']);
    a = fill(a, 2, ['4', '4', '4', '4', '3']);
    const s = score(a);
    expect(s.dominant).toBe('视觉规则');
    expect(s.companions).toEqual(['功能效率']);
  });
  it('低关注即使更高也不抢主导', () => {
    const s = score(fill(fill(base(), 0, ['4', '4', '4', '4', '4']), 5, ['5', '5', '5', '5']));
    expect(s.dominant).toBe('视觉规则');
    expect(s.companions).toContain('伴随低关注特征');
  });
  it('最高并列保持复核，不随机分类', () => {
    const s = score(fill(fill(base(), 0, ['4', '4', '4', '4', '4']), 1, ['4', '4', '4', '4', '4']));
    expect(s.dominant).toBe('并列待复核');
    expect(s.needsReview).toBe(true);
    expect(s.tied).toEqual(['视觉规则', '分类秩序']);
    expect(s.companions).toEqual([]);
  });
  it('部分资料不足不隐式判断无倾向', () => {
    const s = score(fill({}, 0, ['4', '4', '4', '4', 'X']));
    expect(s.dominant).toBe('视觉规则');
    expect(s.provisional).toBe(true);
    expect(s.insufficient).toHaveLength(5);
  });
  it('各维度覆盖30题且不重叠', () => {
    const ids = dimensions.flatMap((d) => [...d.ids]);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });
});
