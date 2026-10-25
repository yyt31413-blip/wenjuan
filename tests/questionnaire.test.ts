import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  questions,
  questionnaire,
  toggleChoice,
  updateAnswer,
  getOptions,
} from '../src/lib/questions';
import { validateAnswers, validateSubmission } from '../src/lib/validation';
const complete = Object.fromEntries(
  questions.map((q) => [q.id, { choices: [q.options[0].value] }]),
);
const consent = { A01: { choices: ['A'] } };
describe('题库及验证', () => {
  it('42道完整顺序题，题干逐字对应提取原文', () => {
    expect(questions).toHaveLength(42);
    expect(questions.map((q) => q.id)).toEqual([
      'A01',
      'A02',
      'A03',
      'A04',
      'A05',
      ...Array.from({ length: 30 }, (_, i) => 'B' + String(i + 1).padStart(2, '0')),
      'C01',
      'C02',
      'C03',
      'C04',
      'C05',
      'C06',
      'D01',
    ]);
    const source = readFileSync('docs/桌面使用和整理习惯问卷2.txt', 'utf8');
    questions.forEach((q) => expect(source).toContain(q.title));
  });
  it('照片与原文提取摘要一致', () =>
    expect(
      createHash('sha256').update(readFileSync('public/images/image1.png')).digest('hex'),
    ).toBe(questionnaire.photoSha256));
  it('D01选答，其余41题需完成才能提交', () => {
    expect(validateAnswers(complete)).toEqual(complete);
    expect(() => validateAnswers(consent)).toThrow('A02');
    expect(() => validateAnswers({ ...complete, C03: { choices: [] } })).toThrow('C03');
    const { D01, ...withoutOptional } = complete;
    expect(validateAnswers(withoutOptional)).toEqual(withoutOptional);
  });
  it('不同意不能提交', () => expect(() => validateAnswers({})).toThrow('自愿'));
  it('A05排他条件前后端均检查', () => {
    const q = questions.find((q) => q.id === 'A05')!;
    expect(toggleChoice(q, { choices: ['A', 'B'] }, 'F').choices).toEqual(['F']);
    expect(toggleChoice(q, { choices: ['F'] }, 'A').choices).toEqual(['A']);
    expect(() => validateAnswers({ ...complete, A05: { choices: ['A', 'F'] } })).toThrow('同时');
  });
  it('C02最多3项；第四项不丢失旧答案', () => {
    const q = questions.find((q) => q.id === 'C02')!,
      old = { choices: ['A', 'B', 'C'] };
    expect(toggleChoice(q, old, 'D')).toBe(old);
    expect(() => validateAnswers({ ...complete, C02: { choices: ['A', 'B', 'C', 'D'] } })).toThrow(
      '数量',
    );
  });
  it('C03选项依赖C02，修改会清空失效答案', () => {
    const a = { C02: { choices: ['A', 'B'] }, C03: { choices: ['B'] } };
    expect(
      getOptions(
        questions.find((q) => q.id === 'C03')!,
        a,
      ).map((o) => o.value),
    ).toEqual(['A', 'B']);
    expect(updateAnswer(a, 'C02', { choices: ['A'] }).C03).toBeUndefined();
    expect(() => validateAnswers({ ...complete, ...a, C02: { choices: ['A'] } })).toThrow('C03');
  });
  it('拒绝未知题号、重复选项、非法类型和单选多答', () => {
    for (const a of [
      { Z01: { choices: ['A'] } },
      { A02: { choices: ['A', 'A'] } },
      { A02: { choices: ['A', 'B'] } },
      { B01: { choices: [4] } },
      { B01: { choices: ['0'] } },
    ])
      expect(() => validateAnswers({ ...complete, ...a })).toThrow();
  });
  it('补充内容只能用于其他选项且限制500字', () => {
    expect(
      validateAnswers({ ...complete, A04: { choices: ['E'], other: '  艺术创作  ' } }).A04.other,
    ).toBe('艺术创作');
    expect(() => validateAnswers({ ...complete, A04: { choices: ['A'], other: 'x' } })).toThrow();
    expect(() =>
      validateAnswers({ ...complete, A04: { choices: ['E'], other: 'a'.repeat(501) } }),
    ).toThrow();
  });
  it('提交需要随机UUIDv4凭证', () => {
    expect(() => validateSubmission({ answers: complete, submissionKey: 'fake' })).toThrow();
    expect(
      validateSubmission({
        answers: complete,
        submissionKey: 'a63f3c2f-1e5e-4c57-9b29-4eead3f71003',
      }).answers,
    ).toEqual(complete);
  });
});
