export type ChartRow = {
  label: string;
  count: number;
  percent?: number;
  denominator?: number;
  display?: string;
  pieCount?: number;
};
export type DotMetric = {
  label: string;
  count: number;
  percent: number;
  denominator: number;
};
export type DotGroup = { label: string; metrics: DotMetric[] };
export type ChartData = {
  title: string;
  note: string;
  rows: ChartRow[];
  max?: number;
  pieMode?: 'parts' | 'independent';
  visualMode?: 'lollipop';
  dotGroups?: DotGroup[];
};
export type ChartView = 'bar' | 'pie';
export const PIE_COLORS = ['#5f8e8e', '#80b0ae', '#a4d0c8', '#c0e0dd', '#d5e9e8', '#e7f1f1'];
export const PIE_REMAINDER = PIE_COLORS[1];
export const DOT_COLORS = ['#32bb8d', '#b8c6c0', '#f7faf8'];
export async function exportPng(
  charts: ChartData[],
  filename: string,
  generatedAt: string,
  view: ChartView = 'bar',
) {
  await document.fonts.ready;
  const width = 1200,
    pad = 64,
    canvas = document.createElement('canvas'),
    ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 PNG 导出。');
  const font = '"Noto Sans SC Variable", "Microsoft YaHei", sans-serif';
  function wrap(text: string, maxWidth: number, size: number) {
    ctx!.font = `${size}px ${font}`;
    const lines: string[] = [];
    let current = '';
    for (const c of text) {
      if (c === '\n') {
        lines.push(current);
        current = '';
        continue;
      }
      if (ctx!.measureText(current + c).width > maxWidth && current) {
        lines.push(current);
        current = c;
      } else current += c;
    }
    if (current) lines.push(current);
    return lines;
  }
  function drawPie(x: number, y: number, radius: number, values: number[], colors: string[]) {
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
    if (!total) {
      ctx!.fillStyle = '#353535';
      ctx!.beginPath();
      ctx!.arc(x, y, radius, 0, Math.PI * 2);
      ctx!.fill();
      return;
    }
    const fullIndex = values.findIndex((value) => value >= total);
    if (fullIndex !== -1) {
      ctx!.fillStyle = colors[fullIndex % colors.length];
      ctx!.beginPath();
      ctx!.arc(x, y, radius, 0, Math.PI * 2);
      ctx!.fill();
      return;
    }
    let angle = -Math.PI / 2;
    values.forEach((value, index) => {
      if (value <= 0) return;
      const end = angle + (value / total) * Math.PI * 2;
      ctx!.fillStyle = colors[index % colors.length];
      ctx!.beginPath();
      ctx!.moveTo(x, y);
      ctx!.arc(x, y, radius, angle, end);
      ctx!.closePath();
      ctx!.fill();
      angle = end;
    });
  }
  const layouts = charts.map((c) => ({
    c,
    mode: view === 'pie' ? (c.dotGroups ? 'grouped-dot' : (c.visualMode ?? c.pieMode)) : undefined,
    title: wrap(c.title, width - 2 * pad, 32),
    note: wrap(c.note, width - 2 * pad, 18),
    rows: c.rows.map((r) => ({ r, lines: wrap(r.label, width - 2 * pad - 330, 21) })),
  }));
  const bodyHeight = (l: (typeof layouts)[number]) =>
    l.mode === 'grouped-dot'
      ? 48 + (l.c.dotGroups?.length ?? 0) * 158
      : l.mode === 'lollipop'
        ? 40 + l.rows.reduce((sum, row) => sum + Math.max(112, row.lines.length * 32 + 75), 0)
        : l.mode === 'parts'
          ? Math.max(
              280,
              l.rows.reduce((sum, row) => sum + row.lines.length * 30 + 28, 10),
            )
          : l.mode === 'independent'
            ? l.rows.reduce((sum, row) => sum + Math.max(112, row.lines.length * 30 + 56), 0)
            : l.rows.reduce((sum, row) => sum + row.lines.length * 32 + 44, 0);
  const height =
    layouts.reduce(
      (h, l) => h + l.title.length * 46 + 18 + l.note.length * 29 + 32 + bodyHeight(l) + 64,
      80,
    ) + 120;
  if (height > 15000) throw new Error('图表过长，请单独导出各项图表。');
  canvas.width = width * 2;
  canvas.height = height * 2;
  ctx.scale(2, 2);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  let y = 64;
  const text = (t: string, x: number, yy: number, size: number, color = '#fff') => {
    ctx.font = `${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.fillText(t, x, yy);
  };
  for (const l of layouts) {
    for (const line of l.title) {
      text(line, pad, y, 32);
      y += 46;
    }
    y += 18;
    for (const line of l.note) {
      text(line, pad, y, 18, '#bdbdbd');
      y += 29;
    }
    y += 32;
    if (l.mode === 'grouped-dot') {
      const trackX = pad + 235;
      const trackWidth = width - 2 * pad - 440;
      [0, 25, 50, 75, 100].forEach((tick) => {
        const value = `${tick}%`;
        ctx.font = `15px ${font}`;
        text(
          value,
          trackX + (trackWidth * tick) / 100 - ctx.measureText(value).width / 2,
          y + 8,
          15,
          '#bdbdbd',
        );
      });
      y += 40;
      for (const group of l.c.dotGroups ?? []) {
        text(group.label, pad, y + 24, 23);
        group.metrics.forEach((metric, index) => {
          const rowY = y + 55 + index * 34;
          const dotX = trackX + (trackWidth * Math.max(0, Math.min(100, metric.percent))) / 100;
          text(metric.label, pad + 112, rowY + 6, 17, DOT_COLORS[index]);
          ctx.fillStyle = '#35423d';
          ctx.fillRect(trackX, rowY, trackWidth, 1);
          ctx.fillStyle = DOT_COLORS[index];
          ctx.beginPath();
          ctx.arc(dotX, rowY, 7, 0, Math.PI * 2);
          ctx.fill();
          text(
            `${metric.count} 人 / ${metric.percent.toFixed(1)}%（n=${metric.denominator}）`,
            trackX + trackWidth + 18,
            rowY + 6,
            16,
            '#bdbdbd',
          );
        });
        y += 158;
      }
      y += 8;
    } else if (l.mode === 'lollipop') {
      const trackWidth = width - 2 * pad;
      [0, 25, 50, 75, 100].forEach((tick) => {
        const value = `${tick}%`;
        ctx.font = `15px ${font}`;
        text(
          value,
          pad + (trackWidth * tick) / 100 - ctx.measureText(value).width / 2,
          y + 8,
          15,
          '#bdbdbd',
        );
      });
      y += 40;
      for (const { r, lines } of l.rows) {
        const rowHeight = Math.max(112, lines.length * 32 + 75);
        let labelY = y + 28;
        for (const line of lines) {
          text(line, pad, labelY, 21);
          labelY += 32;
        }
        const suffix = `${r.count} 人 / ${(r.percent ?? 0).toFixed(1)}%（n=${r.denominator ?? 0}）`;
        ctx.font = `18px ${font}`;
        text(suffix, width - pad - ctx.measureText(suffix).width, y + 28, 18, '#bdbdbd');
        const lineY = labelY + 14;
        const dotX = pad + (trackWidth * Math.max(0, Math.min(100, r.percent ?? 0))) / 100;
        ctx.fillStyle = '#35423d';
        ctx.fillRect(pad, lineY, trackWidth, 2);
        ctx.fillStyle = DOT_COLORS[0];
        ctx.fillRect(pad, lineY, dotX - pad, 2);
        ctx.beginPath();
        ctx.arc(dotX, lineY + 1, 8, 0, Math.PI * 2);
        ctx.fill();
        y += rowHeight;
      }
    } else if (l.mode === 'parts') {
      drawPie(
        pad + 120,
        y + 120,
        110,
        l.rows.map(({ r }) => r.count),
        PIE_COLORS,
      );
      let legendY = y + 15;
      l.rows.forEach(({ r, lines }, index) => {
        ctx.fillStyle = PIE_COLORS[index % PIE_COLORS.length];
        ctx.fillRect(pad + 300, legendY - 12, 14, 14);
        for (const line of lines) {
          text(line, pad + 330, legendY, 21);
          legendY += 30;
        }
        text(
          r.display ?? `${r.count} 人 / ${(r.percent ?? 0).toFixed(1)}%（n=${r.denominator ?? 0}）`,
          pad + 330,
          legendY,
          18,
          '#bdbdbd',
        );
        legendY += 28;
      });
      y += bodyHeight(l);
    } else if (l.mode === 'independent') {
      for (const { r, lines } of l.rows) {
        const count = r.pieCount ?? r.count;
        const denominator = r.denominator ?? 0;
        const rowHeight = Math.max(112, lines.length * 30 + 56);
        drawPie(
          pad + 50,
          y + rowHeight / 2,
          43,
          [Math.min(count, denominator), Math.max(0, denominator - count)],
          [PIE_COLORS[2], PIE_REMAINDER],
        );
        let labelY = y + 35;
        for (const line of lines) {
          text(line, pad + 125, labelY, 21);
          labelY += 30;
        }
        text(
          r.display ?? `${r.count} 人 / ${(r.percent ?? 0).toFixed(1)}%（n=${denominator}）`,
          pad + 125,
          labelY,
          18,
          '#bdbdbd',
        );
        y += rowHeight;
      }
    } else {
      const max = l.c.max ?? Math.max(1, ...l.c.rows.map((r) => r.count));
      for (const { r, lines } of l.rows) {
        const suffix =
          r.display ??
          `${r.count} 人${r.percent === undefined ? '' : ` / ${r.percent.toFixed(1)}%`}${r.denominator === undefined ? '' : `（n=${r.denominator}）`}`;
        ctx.font = `18px ${font}`;
        text(suffix, width - pad - ctx.measureText(suffix).width, y, 18, '#bdbdbd');
        for (const line of lines) {
          text(line, pad, y, 21);
          y += 32;
        }
        ctx.fillStyle = '#262626';
        ctx.fillRect(pad, y, width - 2 * pad, 6);
        ctx.fillStyle = '#a8e6cf';
        ctx.fillRect(pad, y, (width - 2 * pad) * Math.min(1, r.count / max), 6);
        y += 44;
      }
    }
    y += 24;
    ctx.fillStyle = '#555';
    ctx.fillRect(pad, y, width - 2 * pad, 1);
    y += 40;
  }
  text('日常桌面使用与整理习惯问卷 · 匿名汇总', pad, height - 65, 16, '#bdbdbd');
  text(
    '数据快照：' +
      new Date(generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) +
      '（北京时间）',
    pad,
    height - 35,
    15,
    '#bdbdbd',
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 生成失败。'))), 'image/png'),
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]/g, '_') + '.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  canvas.width = 0;
  canvas.height = 0;
}
