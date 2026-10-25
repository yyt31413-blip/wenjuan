'use client';
import { useEffect, useRef, useState } from 'react';
import { questions, updateAnswer, toggleChoice, type Answers } from '@/lib/questions';
import { createSubmissionKey } from '@/lib/submission-key';
const DRAFT_KEY = 'desktop-order-survey-v1';
export function useSurvey() {
  const [answers, setAnswers] = useState<Answers>({}),
    [index, setIndex] = useState(-1),
    [ready, setReady] = useState(false),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [submissionKey, setSubmissionKey] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    locked = useRef(false),
    sending = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    locked.current = false;
  };
  useEffect(() => {
    let key = createSubmissionKey();
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.answers && typeof d.answers === 'object' && typeof d.submissionKey === 'string') {
          setAnswers(d.answers);
          key = d.submissionKey;
        }
      }
    } catch {}
    setSubmissionKey(key);
    setReady(true);
    return cancel;
  }, []);
  useEffect(() => {
    if (ready && !success)
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, submissionKey }));
      } catch {}
  }, [answers, submissionKey, ready, success]);
  const move = (n: number) => {
    cancel();
    setError('');
    setIndex(Math.max(-1, Math.min(questions.length - 1, n)));
  };
  const choose = (value: string) => {
    if (locked.current || busy) return;
    const q = questions[index],
      next = toggleChoice(q, answers[q.id], value);
    if (q.maxChoices && next === answers[q.id]) {
      setError(`本题最多选择 ${q.maxChoices} 项。`);
      return;
    }
    setError('');
    setAnswers((prev) => updateAnswer(prev, q.id, next));
    if (!q.multiple && value !== q.otherValue && index < questions.length - 1) {
      locked.current = true;
      timer.current = setTimeout(() => {
        locked.current = false;
        setIndex((i) => i + 1);
      }, 400);
    }
  };
  const other = (value: string) => {
    cancel();
    const q = questions[index];
    setAnswers((prev) => updateAnswer(prev, q.id, { ...prev[q.id], other: value }));
  };
  const submit = async () => {
    if (sending.current) return;
    cancel();
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      let res: Response;
      try {
        res = await fetch('/api/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers, submissionKey }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败，请稍后重试。');
      if (data.saved !== true) throw new Error('未收到数据库保存确认，请重试。');
      setSuccess(true);
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
    } catch (e) {
      setError(
        e instanceof Error && e.name === 'AbortError'
          ? '网络请求超时，答案已保留。请重试，重复请求不会重复保存。'
          : e instanceof Error
            ? e.message
            : '网络异常，答案已保留，请重试。',
      );
    } finally {
      setBusy(false);
      sending.current = false;
    }
  };
  return { answers, index, ready, success, busy, error, choose, other, move, submit };
}
