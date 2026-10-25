import source from '@/data/questionnaire.json';
export type Option = { value: string; label: string };
export type Question = {
  id: string;
  title: string;
  section: string;
  multiple: boolean;
  options: Option[];
  required?: boolean;
  otherValue?: string;
  maxChoices?: number;
  exclusiveValue?: string;
  image?: string;
};
export type Answer = { choices: string[]; other?: string };
export type Answers = Record<string, Answer>;
export const questions: Question[] = source.questions;
export const questionnaire = source;
export const getOptions = (q: Question, answers: Answers) =>
  q.id === 'C03' ? q.options.filter((o) => answers.C02?.choices.includes(o.value)) : q.options;
export function updateAnswer(answers: Answers, id: string, answer: Answer): Answers {
  const next = { ...answers, [id]: answer };
  if (id === 'C02' && next.C03?.choices.some((c) => !answer.choices.includes(c))) delete next.C03;
  return next;
}
export function toggleChoice(q: Question, old: Answer | undefined, value: string): Answer {
  const choices = old?.choices ?? [];
  let next = q.multiple
    ? choices.includes(value)
      ? choices.filter((x) => x !== value)
      : [...choices, value]
    : [value];
  if (q.exclusiveValue) {
    if (value === q.exclusiveValue && next.includes(value)) next = [value];
    else next = next.filter((x) => x !== q.exclusiveValue);
  }
  if (q.maxChoices && next.length > q.maxChoices) return old ?? { choices: [] };
  return {
    choices: next,
    ...(q.otherValue && next.includes(q.otherValue) ? { other: old?.other ?? '' } : {}),
  };
}
export function answerLabel(q: Question, answer?: Answer) {
  return answer?.choices.length
    ? answer.choices
        .map(
          (c) =>
            `${c} ${q.options.find((o) => o.value === c)?.label ?? c}${c === q.otherValue && answer.other ? '（' + answer.other + '）' : ''}`,
        )
        .join('；')
    : '未作答';
}
