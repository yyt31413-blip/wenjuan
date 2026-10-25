'use client';
import { useEffect, useRef } from 'react';
import { questions, questionnaire, getOptions } from '@/lib/questions';
import { useSurvey } from '@/hooks/useSurvey';
import Celebration from './Celebration';
export default function Survey({ registrationUrl }: { registrationUrl: string | null }) {
  const s = useSurvey(),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [s.index, s.success]);
  if (s.success)
    return (
      <main className="thanks">
        <Celebration />
        <div>
          <p className="eyebrow mint">已提交</p>
          <h1 ref={heading} tabIndex={-1}>
            感谢您的参与！
          </h1>
          <p>您的回答已成功提交。</p>
          {s.answers.D01?.choices.includes('A') &&
            registrationUrl &&
            /^https:\/\//.test(registrationUrl) && (
              <div className="registration">
                <p>后续活动的联系方式将独立、自愿登记，不与本份匿名答卷绑定。</p>
                <a
                  className="button"
                  href={registrationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  了解后续活动 ↗
                </a>
              </div>
            )}
        </div>
      </main>
    );
  if (s.index < 0)
    return (
      <div className="shell landing">
        <header className="brand">
          <span>日常桌面研究</span>
          <span className="muted">毕业设计 · 匿名调查</span>
        </header>
        <main className="intro">
          <p className="eyebrow mint">使用 · 摆放 · 评价</p>
          <h1>
            日常桌面使用
            <br className="desktop-break" />
            与整理习惯问卷
          </h1>
          <div className="intro-copy">
            {questionnaire.intro.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <button className="button start" disabled={!s.ready} onClick={() => s.move(0)}>
            开始填写 <span aria-hidden>→</span>
          </button>
          <p className="meta">42 道题 / 自愿参与 / 最后一题选答</p>
          {Object.keys(s.answers).length > 0 && (
            <p className="mint small">已保留本标签页中的作答，开始后可继续修改。</p>
          )}
        </main>
        <footer className="site-footer">
          <span>每一种日常，都值得被理解。</span>
          <span>DESKTOP ORDER STUDY</span>
        </footer>
      </div>
    );
  const q = questions[s.index],
    answer = s.answers[q.id],
    last = s.index === questions.length - 1,
    options = getOptions(q, s.answers),
    percent = Math.round(((s.index + 1) / questions.length) * 100);
  const hasOther = !!q.otherValue && answer?.choices.includes(q.otherValue);
  return (
    <div className="shell survey">
      <header className="survey-header">
        <div className="brand">
          <span>{questionnaire.title}</span>
          <span className="section-name">{q.section}</span>
        </div>
        <div className="progress-label">
          <span>
            <strong className="mint">{String(s.index + 1).padStart(2, '0')}</strong>
            <span className="muted"> / 42</span>
          </span>
          <span>{percent}%</span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label="问卷进度"
          aria-valuenow={s.index + 1}
          aria-valuemin={0}
          aria-valuemax={42}
        >
          <div style={{ width: `${percent}%` }} />
        </div>
      </header>
      <main className="question fade-in" key={q.id} aria-labelledby="question-title">
        <div className="question-meta">
          <span className="mint">{q.id}</span>
          <span>
            {q.required ? (q.multiple ? '多选 · 必答' : '单选 · 必答') : '单选 · 选答'}
            {q.maxChoices ? ` · 最多 ${q.maxChoices} 项` : ''}
          </span>
        </div>
        <h1 id="question-title" ref={heading} tabIndex={-1}>
          {q.title}
        </h1>
        {q.id.startsWith('B') && <p className="hint">{questionnaire.behaviorHint}</p>}
        {q.image && (
          <figure className="photo">
            <img
              src={q.image}
              width={1448}
              height={1086}
              alt="问卷原始桌面照片：桌面上摆放着电脑、平板、键盘、笔记本、笔与其他物品。"
            />
          </figure>
        )}
        <div
          className={q.id.startsWith('B') ? 'options scale' : 'options'}
          role="group"
          aria-label={q.title}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={'option ' + (answer?.choices.includes(o.value) ? 'selected' : '')}
              aria-pressed={!!answer?.choices.includes(o.value)}
              disabled={s.busy}
              onClick={() => s.choose(o.value)}
            >
              <span className="option-code">{o.value}</span>
              <span>{o.label}</span>
              <span className="selection-mark" aria-hidden>
                {answer?.choices.includes(o.value) ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>
        {hasOther && (
          <label className="other-field">
            其他（选填，最多500字）
            <textarea
              value={answer?.other ?? ''}
              maxLength={500}
              onChange={(e) => s.other(e.target.value)}
              rows={3}
            />
          </label>
        )}
        <p className="interaction-hint">
          {last
            ? '本题选答；确认后提交。'
            : q.multiple
              ? '选择完成后，请点击下方按钮。'
              : hasOther
                ? '补充完成后，请点击下一题。'
                : '选择后约 0.4 秒自动进入下一题。'}
        </p>
        {s.error && (
          <p className="notice" role="alert">
            {s.error}
          </p>
        )}
        <nav className="question-nav" aria-label="答题导航">
          <button className="text-button" disabled={s.busy} onClick={() => s.move(s.index - 1)}>
            ← {s.index === 0 ? '返回说明' : '上一题'}
          </button>
          <div>
            {last ? (
              <button
                className="button"
                disabled={s.busy || (q.required && !answer?.choices.length)}
                onClick={s.submit}
              >
                {s.busy ? '正在保存…' : '提交问卷 →'}
              </button>
            ) : (
              <button
                className="button"
                disabled={s.busy || !answer?.choices.length}
                onClick={() => s.move(s.index + 1)}
              >
                {q.multiple ? '完成选择 →' : '下一题 →'}
              </button>
            )}
          </div>
        </nav>
      </main>
      <footer className="site-footer">
        <span>没有正确答案，请按真实经历作答。</span>
        <span>{q.section}</span>
      </footer>
    </div>
  );
}
