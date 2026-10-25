'use client';
import { useEffect, useState } from 'react';
import type { Statistics } from '@/lib/statistics';
import {
  exportPng,
  DOT_COLORS,
  PIE_COLORS,
  PIE_REMAINDER,
  type ChartData,
  type ChartView,
} from '@/lib/exports/png';
const tabs = ['数据总览', '秩序倾向分析', 'C题目分析'] as const;
type AdminData = {
  stats: Statistics;
};
const time = (s: string) =>
  new Date(s).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
function tendencyChart(
  s: Statistics,
  kind: 'dominant' | 'evident' | 'companion',
  title: string,
): ChartData {
  return {
    title,
    note: '分母为各维度达到最低有效作答标准的人数；各维度分母可能不同，比例不要求合计100%。',
    rows: s.tendencyStats.map((d) => ({
      label: d.name,
      count: d[kind],
      percent: d[`${kind}Percent`],
      denominator: d.valid,
    })),
  };
}
function distributionCharts(s: Statistics): ChartData[] {
  return s.tendencyStats.map((d) => ({
    title: d.name + ' · 平均分分布',
    note: `仅统计该维度资料充足的 ${d.valid} 人。资料不足 ${d.insufficient} 人不进入分布。`,
    pieMode: 'parts',
    rows: d.bins.map((b) => ({
      label: b.label,
      count: b.count,
      percent: d.valid ? (b.count / d.valid) * 100 : 0,
      denominator: d.valid,
    })),
  }));
}
function rowValue(r: ChartData['rows'][number]) {
  return (
    r.display ??
    `${r.count} 人${r.percent === undefined ? '' : ` / ${r.percent.toFixed(1)}%`}${r.denominator === undefined ? '' : `（n=${r.denominator}）`}`
  );
}
function binaryDotGroups(
  rows: ChartData['rows'],
  selectedLabel: string,
  remainderLabel: string,
): NonNullable<ChartData['dotGroups']> {
  return rows.map((row) => {
    const denominator = row.denominator ?? 0;
    const selected = Math.min(denominator, Math.max(0, row.pieCount ?? row.count));
    const selectedPercent = denominator ? (selected / denominator) * 100 : 0;
    return {
      label: row.label,
      metrics: [
        {
          label: selectedLabel,
          count: selected,
          percent: selectedPercent,
          denominator,
        },
        {
          label: remainderLabel,
          count: denominator - selected,
          percent: denominator ? 100 - selectedPercent : 0,
          denominator,
        },
      ],
    };
  });
}
function PieGraphic({
  values,
  colors,
  large = false,
}: {
  values: number[];
  colors: string[];
  large?: boolean;
}) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  let position = 0;
  return (
    <svg
      className={`pie-circle${large ? ' pie-circle-large' : ''}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      {total === 0 ? (
        <circle cx="50" cy="50" r="50" fill="#353535" />
      ) : (
        values.map((value, index) => {
          if (value <= 0) return null;
          const start = position;
          position += value / total;
          if (value >= total)
            return (
              <circle key={index} cx="50" cy="50" r="50" fill={colors[index % colors.length]} />
            );
          const from = start * 2 * Math.PI - Math.PI / 2;
          const to = position * 2 * Math.PI - Math.PI / 2;
          const x1 = 50 + 50 * Math.cos(from);
          const y1 = 50 + 50 * Math.sin(from);
          const x2 = 50 + 50 * Math.cos(to);
          const y2 = 50 + 50 * Math.sin(to);
          return (
            <path
              key={index}
              d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${value / total > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`}
              fill={colors[index % colors.length]}
            />
          );
        })
      )}
    </svg>
  );
}
function Pie({ chart }: { chart: ChartData }) {
  if (chart.pieMode === 'parts') {
    return (
      <div className="pie-overview">
        <PieGraphic values={chart.rows.map((row) => row.count)} colors={PIE_COLORS} large />
        <div className="pie-legend">
          {chart.rows.map((row, index) => (
            <div className="pie-legend-row" key={row.label}>
              <span
                className="pie-swatch"
                style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
              />
              <span>{row.label}</span>
              <strong>{rowValue(row)}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="pie-grid">
      {chart.rows.map((row) => {
        const count = row.pieCount ?? row.count;
        const denominator = row.denominator ?? 0;
        return (
          <div className="pie-item" key={row.label}>
            <PieGraphic
              values={[Math.min(count, denominator), Math.max(0, denominator - count)]}
              colors={[PIE_COLORS[2], PIE_REMAINDER]}
            />
            <div>
              <strong>{row.label}</strong>
              <span>{rowValue(row)}</span>
              <small>亮薄荷绿为该项，深灰绿为其余有效作答</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function Lollipop({ chart }: { chart: ChartData }) {
  return (
    <div className="lollipop-chart">
      <div className="dot-axis">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
      {chart.rows.map((row) => {
        const percent = Math.max(0, Math.min(100, row.percent ?? 0));
        return (
          <div className="lollipop-row" key={row.label}>
            <div className="bar-label">
              <span>{row.label}</span>
              <span className="bar-value">{rowValue(row)}</span>
            </div>
            <div className="lollipop-track">
              <span className="lollipop-stem" style={{ width: `${percent}%` }} />
              <span className="lollipop-dot" style={{ left: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
function GroupedDots({ chart }: { chart: ChartData }) {
  return (
    <div className="grouped-dot-chart">
      <div className="dot-axis">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
      {chart.dotGroups?.map((group) => (
        <div className="grouped-dot-row" key={group.label}>
          <h4>{group.label}</h4>
          {group.metrics.map((metric, index) => (
            <div className="grouped-dot-metric" key={metric.label}>
              <span className="dot-metric-label">{metric.label}</span>
              <div className="dot-track">
                <span
                  className="dot-marker"
                  style={{
                    left: `${Math.max(0, Math.min(100, metric.percent))}%`,
                    backgroundColor: DOT_COLORS[index],
                  }}
                />
              </div>
              <span className="dot-metric-value">
                {metric.count} 人 / {metric.percent.toFixed(1)}%（n={metric.denominator}）
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
function ViewToggle({ view, onChange }: { view: ChartView; onChange: (view: ChartView) => void }) {
  return (
    <div className="chart-view-toggle" role="group" aria-label="图表显示方式">
      <button aria-pressed={view === 'bar'} onClick={() => onChange('bar')}>
        柱状图
      </button>
      <button aria-pressed={view === 'pie'} onClick={() => onChange('pie')}>
        可视化图表
      </button>
    </div>
  );
}
function Chart({
  chart,
  view = 'bar',
  onExport,
}: {
  chart: ChartData;
  view?: ChartView;
  onExport: (c: ChartData, view: ChartView) => void;
}) {
  const max = chart.max ?? Math.max(1, ...chart.rows.map((r) => r.count));
  return (
    <section className="chart-section">
      <div className="chart-heading">
        <h3>{chart.title}</h3>
        <button className="button" onClick={() => onExport(chart, view)}>
          导出 PNG ↓
        </button>
      </div>
      <p className="chart-note">{chart.note}</p>
      {view === 'pie' && chart.dotGroups ? (
        <GroupedDots chart={chart} />
      ) : view === 'pie' && chart.visualMode === 'lollipop' ? (
        <Lollipop chart={chart} />
      ) : view === 'pie' && chart.pieMode ? (
        <Pie chart={chart} />
      ) : (
        <div className="bars">
          {chart.rows.map((r, i) => (
            <div key={i}>
              <div className="bar-label">
                <span>{r.label}</span>
                <span className="bar-value">{rowValue(r)}</span>
              </div>
              <div className="bar-track">
                <div style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export default function Admin() {
  const [data, setData] = useState<AdminData | null>(null),
    [generatedAt, setGeneratedAt] = useState(''),
    [tab, setTab] = useState<(typeof tabs)[number]>('数据总览'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [loginNeeded, setLoginNeeded] = useState(false),
    [tendencyView, setTendencyView] = useState<ChartView>('bar'),
    [cView, setCView] = useState<ChartView>('bar'),
    [exporting, setExporting] = useState(false);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/data', { cache: 'no-store' });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        setLoginNeeded(true);
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setData({ stats: data.stats });
      setGeneratedAt(data.generatedAt);
      setLoginNeeded(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取数据失败。');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败。');
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/logout', { method: 'POST' });
      if (!res.ok) throw new Error('退出失败，请重试。');
      setData(null);
      setLoginNeeded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function png(charts: ChartData[], name: string, view: ChartView = 'bar') {
    setExporting(true);
    setError('');
    try {
      await exportPng(charts, name, generatedAt, view);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const onExport = (c: ChartData, view: ChartView) => void png([c], c.title, view);
  if (loginNeeded)
    return (
      <main className="login">
        <p className="eyebrow mint">研究管理</p>
        <h1>管理员登录</h1>
        <p>仅限研究者访问问卷统计数据。</p>
        <form onSubmit={login}>
          <label>
            邮箱
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            密码
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          {error && (
            <div className="notice" role="alert">
              {error}
            </div>
          )}
          <button className="button" disabled={loading}>
            {loading ? '正在验证…' : '登录 →'}
          </button>
        </form>
        <p>
          <a href="/">← 返回问卷</a>
        </p>
      </main>
    );
  if (data === null)
    return (
      <main className="login">
        <h1>研究管理</h1>
        {loading ? (
          <p role="status">正在验证身份…</p>
        ) : (
          <>
            <p className="notice" role="alert">
              {error}
            </p>
            <button className="button" onClick={load}>
              重新连接
            </button>
            <p>
              <a href="/">返回问卷</a>
            </p>
          </>
        )}
      </main>
    );
  const stats = data.stats;
  const dominant = tendencyChart(stats, 'dominant', '六种主导倾向人数分布'),
    evident = tendencyChart(stats, 'evident', '各维度明显倾向'),
    companion = tendencyChart(stats, 'companion', '伴随倾向出现人数');
  const tendencyComparison: ChartData = {
    title: '六种倾向 · 主导、明显与伴随对照',
    note: '每个点的百分比均以该维度资料充足的人数为分母；不同维度分母可能不同，三项指标也可能重叠。',
    rows: [],
    dotGroups: stats.tendencyStats.map((d) => ({
      label: d.name,
      metrics: [
        { label: '主导', count: d.dominant, percent: d.dominantPercent, denominator: d.valid },
        { label: '明显', count: d.evident, percent: d.evidentPercent, denominator: d.valid },
        { label: '伴随', count: d.companion, percent: d.companionPercent, denominator: d.valid },
      ],
    })),
  };
  const ratio: ChartData = {
    ...dominant,
    title: '六种主导倾向占比',
    pieMode: 'independent',
    max: 100,
    rows: stats.tendencyStats.map((d) => ({
      label: d.name,
      count: d.dominantPercent,
      pieCount: d.dominant,
      denominator: d.valid,
      display: `${d.dominantPercent.toFixed(1)}% / ${d.dominant} 人（n=${d.valid}）`,
    })),
  };
  ratio.dotGroups = binaryDotGroups(ratio.rows, '主导', '非主导');
  const timeline: ChartData = {
    title: '提交时间分布',
    note: '按北京时间自然日统计成功提交人数。',
    rows: stats.timeline.map((d) => ({ label: d.date, count: d.count })),
  };
  const summary: ChartData = {
    title: '问卷数据总览',
    note: `共 ${stats.total} 份成功提交；下列状态可能重叠。数据快照：${time(generatedAt)}（北京时间）。`,
    rows: [
      { label: '累计成功提交', count: stats.total },
      { label: '主导倾向不明确', count: stats.unclear },
      { label: '至少一个维度资料不足', count: stats.insufficient },
      { label: '并列待复核', count: stats.review },
    ],
  };
  const cCharts: ChartData[] = stats.cQuestionStats.map((q) => {
    const pairedDots = q.id === 'C02' || q.id === 'C06';
    const rows = q.options.map((o) => ({
      label: `${o.value} ${o.label}`,
      count: o.count,
      percent: o.percent,
      denominator: q.valid,
    }));
    return {
      title: `${q.id} · ${q.title}`,
      note: `有效作答 ${q.valid} 人，未作答 ${q.missing} 人。${q.multiple ? '多选题：各选项占有效作答人数的比例可能合计超过 100%。' : '单选题：各选项占有效作答人数的比例合计为 100%。'}`,
      pieMode: q.id === 'C03' || pairedDots ? undefined : q.multiple ? 'independent' : 'parts',
      visualMode: q.id === 'C03' ? 'lollipop' : undefined,
      dotGroups: pairedDots ? binaryDotGroups(rows, '选择', '未选择') : undefined,
      rows,
    };
  });
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <h1>桌面研究 / 数据管理</h1>
        <button className="text-button" onClick={logout} disabled={loading}>
          退出登录 ↗
        </button>
      </header>
      <nav className="admin-nav" aria-label="后台导航">
        {tabs.map((t) => (
          <button
            className={tab === t ? 'active' : ''}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </nav>
      <main className="admin-main">
        <div className="page-heading">
          <div>
            <p className="eyebrow mint">匿名研究数据</p>
            <h2>{tab}</h2>
          </div>
          <div className="actions">
            <button className="button" onClick={load} disabled={loading}>
              {loading ? '刷新中…' : '刷新数据'}
            </button>
          </div>
        </div>
        {tab === '数据总览' && (
          <p className="chart-note">快照：{time(generatedAt)}（北京时间）。PNG 与当前快照一致。</p>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {exporting && (
          <p role="status" className="mint small">
            正在生成 PNG 图片…
          </p>
        )}
        {stats.total === 0 && (
          <div className="empty">尚无成功提交的答卷。收到真实回答后，统计会显示在这里。</div>
        )}
        {tab === '数据总览' && (
          <>
            <div className="metrics">
              {summary.rows.map((r) => (
                <div className="metric" key={r.label}>
                  <span>{r.label}</span>
                  <strong>{r.count}</strong>
                </div>
              ))}
            </div>
            <button
              className="button"
              disabled={exporting}
              onClick={() => png([summary, dominant, evident, timeline], '问卷数据总览')}
            >
              导出完整总览 PNG ↓
            </button>
            <Chart chart={dominant} onExport={onExport} />
            <Chart chart={timeline} onExport={onExport} />
          </>
        )}
        {tab === '秩序倾向分析' && (
          <>
            <ViewToggle view={tendencyView} onChange={setTendencyView} />
            {tendencyView === 'pie' && (
              <p className="chart-note">
                主导、明显和伴随倾向汇总为分组点图；主导占比显示各维度的主导与非主导人数，均分分布显示饼图。
              </p>
            )}
            {tendencyView === 'pie' ? (
              <Chart chart={tendencyComparison} view={tendencyView} onExport={onExport} />
            ) : (
              <Chart chart={dominant} onExport={onExport} />
            )}
            <Chart chart={ratio} view={tendencyView} onExport={onExport} />
            {tendencyView === 'bar' && <Chart chart={evident} onExport={onExport} />}
            {tendencyView === 'bar' && <Chart chart={companion} onExport={onExport} />}
            <button
              className="button"
              style={{ marginTop: 28 }}
              onClick={() => png(distributionCharts(stats), '六维度平均分分布', tendencyView)}
            >
              导出六维平均分分布 PNG ↓
            </button>
            <div className="distribution-grid">
              {distributionCharts(stats).map((c) => (
                <Chart key={c.title} chart={c} view={tendencyView} onExport={onExport} />
              ))}
            </div>
          </>
        )}
        {tab === 'C题目分析' && (
          <>
            <ViewToggle view={cView} onChange={setCView} />
            {cCharts.map((c) => (
              <Chart key={c.title} chart={c} view={cView} onExport={onExport} />
            ))}
          </>
        )}
      </main>
    </div>
  );
}
