import { questions, type Answers } from './questions';
export class ValidationError extends Error {}
export function validateAnswers(input: unknown): Answers {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ValidationError('回答格式不正确。');
  const obj = input as Record<string, unknown>,
    out: Answers = {};
  for (const id of Object.keys(obj))
    if (!questions.some((q) => q.id === id)) throw new ValidationError('存在未知题号。');
  for (const q of questions) {
    const raw = obj[q.id];
    if (raw === undefined) continue;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new ValidationError(`${q.id} 回答格式不正确。`);
    const a = raw as Record<string, unknown>;
    if (Object.keys(a).some((k) => k !== 'choices' && k !== 'other') || !Array.isArray(a.choices))
      throw new ValidationError(`${q.id} 回答格式不正确。`);
    if (
      a.choices.some((c) => typeof c !== 'string' || !q.options.some((o) => o.value === c)) ||
      new Set(a.choices).size !== a.choices.length
    )
      throw new ValidationError(`${q.id} 包含无效或重复选项。`);
    const choices = a.choices as string[];
    if ((!q.multiple && choices.length > 1) || (q.maxChoices && choices.length > q.maxChoices))
      throw new ValidationError(`${q.id} 超过可选数量。`);
    if (q.exclusiveValue && choices.includes(q.exclusiveValue) && choices.length > 1)
      throw new ValidationError(`${q.id} 的“没有明显限制”不可与其他项同时选择。`);
    if (
      a.other !== undefined &&
      (typeof a.other !== 'string' ||
        a.other.length > 500 ||
        !q.otherValue ||
        !choices.includes(q.otherValue))
    )
      throw new ValidationError(`${q.id} 补充文字不合法或超过500字。`);
    out[q.id] = { choices, ...(typeof a.other === 'string' ? { other: a.other.trim() } : {}) };
  }
  if (out.A01?.choices[0] !== 'A') throw new ValidationError('请先确认自愿参与调查。');
  for (const q of questions)
    if (q.required && !out[q.id]?.choices.length)
      throw new ValidationError(`请完成 ${q.id} 后再提交。`);
  if (out.C03?.choices.some((v) => !out.C02?.choices.includes(v)))
    throw new ValidationError('C03 只能选择 C02 中已选择的项目。');
  return out;
}
export function validateSubmission(input: unknown) {
  if (!input || typeof input !== 'object') throw new ValidationError('提交格式不正确。');
  const b = input as Record<string, unknown>;
  if (
    typeof b.submissionKey !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.submissionKey)
  )
    throw new ValidationError('提交凭证不正确，请刷新后重试。');
  return { submissionKey: b.submissionKey, answers: validateAnswers(b.answers) };
}
