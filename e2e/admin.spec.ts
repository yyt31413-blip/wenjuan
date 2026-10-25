import { test, expect } from '@playwright/test';
import { score, dimensions } from '../src/lib/scoring';
import type { Answers } from '../src/lib/questions';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const cQuestions = (
  JSON.parse(readFileSync('src/data/questionnaire.json', 'utf8')).questions as {
    id: string;
    title: string;
    multiple: boolean;
    options: { value: string; label: string }[];
  }[]
).filter((q) => q.id.startsWith('C'));

function mockData(answers: Answers) {
  const row = {
    id: 'test-respondent',
    created_at: '2026-10-24T00:00:00.000Z',
    answers,
    scoring: score(answers),
  };
  const tendencyStats = dimensions.map((d) => {
    const result = row.scoring.dimensions.find((x) => x.name === d.name)!;
    const valid = result.sufficient ? 1 : 0;
    const dominant = valid && row.scoring.dominant === d.name ? 1 : 0;
    const evident = result.evident ? 1 : 0;
    const companion = valid && row.scoring.companions.includes(d.name) ? 1 : 0;
    return {
      name: d.name,
      valid,
      insufficient: 1 - valid,
      dominant,
      dominantPercent: dominant * 100,
      evident,
      evidentPercent: evident * 100,
      companion,
      companionPercent: companion * 100,
      bins: [1, 2, 3, 4].map((n, index) => ({
        label: index === 3 ? '4.0—5.0' : `${n}.0—<${n + 1}.0`,
        count:
          valid && result.mean! >= n && (index === 3 ? result.mean! <= 5 : result.mean! < n + 1)
            ? 1
            : 0,
      })),
    };
  });
  return {
    stats: {
      total: 1,
      unclear: row.scoring.dominant === '主导倾向不明确' ? 1 : 0,
      insufficient: row.scoring.insufficient.length ? 1 : 0,
      review: row.scoring.needsReview ? 1 : 0,
      timeline: [{ date: '2026-10-24', count: 1 }],
      tendencyStats,
      cQuestionStats: cQuestions.map((q) => ({
        id: q.id,
        title: q.title,
        multiple: q.multiple,
        valid: answers[q.id]?.choices.length ? 1 : 0,
        missing: answers[q.id]?.choices.length ? 0 : 1,
        options: q.options.map((o) => ({
          ...o,
          count: answers[q.id]?.choices.includes(o.value) ? 1 : 0,
          percent: answers[q.id]?.choices.includes(o.value) ? 100 : 0,
        })),
      })),
    },
    generatedAt: '2026-10-24T01:00:00.000Z',
  };
}

test('后台按图表类型切换可视化形式', async ({ page }) => {
  const answers: Answers = {
    A01: { choices: ['A'] },
    C01: { choices: ['A'] },
    C02: { choices: ['A', 'B'] },
    C03: { choices: ['A'] },
    ...Object.fromEntries(dimensions[0].ids.map((id) => [id, { choices: ['4'] }])),
  };
  await page.route('**/api/admin/data', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockData(answers)) }),
  );
  await page.goto('/admin');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.getByRole('heading', { name: '数据总览', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新数据' })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(page.getByRole('button', { name: '逐题分析' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '原始答卷' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '最新提交' })).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整总览 PNG' }).click();
  const file = await downloadPromise;
  await file.saveAs(`artifacts/overview-${test.info().project.name}.png`);
  expect(file.suggestedFilename()).toBe('问卷数据总览.png');
  await page.getByRole('button', { name: '秩序倾向分析', exact: true }).click();
  await expect(page.getByRole('heading', { name: '六种主导倾向占比' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '资料状态与复核' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '需要人工复核的记录' })).toHaveCount(0);
  await expect(page.getByText(/低关注独立判断/)).toHaveCount(0);
  await expect(page.getByText(/PNG 与当前快照一致/)).toHaveCount(0);
  await page.getByRole('button', { name: '可视化图表' }).click();
  await expect(page.locator('.chart-section').nth(0).locator('.grouped-dot-chart')).toBeVisible();
  await expect(page.locator('.chart-section').nth(1).locator('.grouped-dot-chart')).toBeVisible();
  await expect(page.locator('.grouped-dot-row')).toHaveCount(12);
  await expect(page.locator('.grouped-dot-metric')).toHaveCount(30);
  await expect(page.locator('.pie-grid')).toHaveCount(0);
  await expect(page.locator('.pie-overview')).toHaveCount(6);
  await expect(page.locator('.chart-section')).toHaveCount(8);
  const dotDownload = page.waitForEvent('download');
  await page.locator('.chart-section').first().getByRole('button', { name: '导出 PNG' }).click();
  const dotFile = await dotDownload;
  const dotPath = `artifacts/grouped-dots-${test.info().project.name}.png`;
  await dotFile.saveAs(dotPath);
  expect((await readFile(dotPath)).readUInt32BE(16)).toBe(2400);
  const ratioDownload = page.waitForEvent('download');
  await page.locator('.chart-section').nth(1).getByRole('button', { name: '导出 PNG' }).click();
  const ratioFile = await ratioDownload;
  const ratioPath = `artifacts/dominant-ratio-dots-${test.info().project.name}.png`;
  await ratioFile.saveAs(ratioPath);
  expect((await readFile(ratioPath)).readUInt32BE(16)).toBe(2400);
  await page.getByRole('button', { name: 'C题目分析', exact: true }).click();
  await expect(page.getByRole('heading', { name: /C01/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /C06/ })).toBeVisible();
  await expect(page.getByText(/逐题汇总 C01/)).toHaveCount(0);
  await expect(page.getByText(/PNG 与当前快照一致/)).toHaveCount(0);
  await expect(page.locator('.chart-section').first()).toContainText('1 人 / 100.0%（n=1）');
  await page.getByRole('button', { name: '可视化图表' }).click();
  await expect(page.locator('.pie-overview').first()).toBeVisible();
  await expect(page.locator('.chart-section').nth(1).locator('.grouped-dot-chart')).toBeVisible();
  await expect(page.locator('.chart-section').nth(5).locator('.grouped-dot-chart')).toBeVisible();
  await expect(page.locator('.pie-overview')).toHaveCount(3);
  await expect(page.locator('.chart-section').nth(2).locator('.lollipop-chart')).toBeVisible();
  await expect(page.locator('.lollipop-row')).toHaveCount(8);
  const c02Download = page.waitForEvent('download');
  await page.locator('.chart-section').nth(1).getByRole('button', { name: '导出 PNG' }).click();
  const c02File = await c02Download;
  const c02Path = `artifacts/c02-dots-${test.info().project.name}.png`;
  await c02File.saveAs(c02Path);
  expect((await readFile(c02Path)).readUInt32BE(16)).toBe(2400);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const lollipopDownload = page.waitForEvent('download');
  await page.locator('.chart-section').nth(2).getByRole('button', { name: '导出 PNG' }).click();
  const lollipopFile = await lollipopDownload;
  const lollipopPath = `artifacts/c03-lollipop-${test.info().project.name}.png`;
  await lollipopFile.saveAs(lollipopPath);
  expect((await readFile(lollipopPath)).readUInt32BE(16)).toBe(2400);
});

test('未登录后台显示登录，不可下载受保护数据', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible();
  expect((await request.get('/api/admin/data')).status()).toBe(401);
});

test('饼图使用海盐薄荷配色且没有描边', async ({ page }) => {
  const data = mockData({ A01: { choices: ['A'] }, C01: { choices: ['B'] } });
  const c01 = data.stats.cQuestionStats.find((item) => item.id === 'C01')!;
  c01.valid = 2;
  for (const option of c01.options) {
    option.count = option.value === 'B' || option.value === 'D' ? 1 : 0;
    option.percent = option.count ? 50 : 0;
  }
  await page.route('**/api/admin/data', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }),
  );
  await page.goto('/admin');
  await page.getByRole('button', { name: 'C题目分析', exact: true }).click();
  await page.getByRole('button', { name: '可视化图表' }).click();
  await page.screenshot({
    path: `artifacts/admin-${test.info().project.name}.png`,
    animations: 'disabled',
  });
  const pie = page.locator('.chart-section').first().locator('.pie-circle');
  await expect(pie.locator('path')).toHaveCount(2);
  await expect(pie.locator('path').nth(0)).toHaveAttribute('fill', '#80b0ae');
  await expect(pie.locator('path').nth(1)).toHaveAttribute('fill', '#c0e0dd');
  await expect(pie.locator('[stroke]')).toHaveCount(0);
  await expect(pie).toHaveCSS('border-top-width', '0px');
  const pending = page.waitForEvent('download');
  await page.locator('.chart-section').first().getByRole('button', { name: '导出 PNG' }).click();
  const file = await pending;
  const path = `artifacts/c01-pie-b-${test.info().project.name}.png`;
  await file.saveAs(path);
  expect((await readFile(path)).readUInt32BE(16)).toBe(2400);
});

test('六维分布 PNG 独立导出，物理宽度为 2400 像素', async ({ page }) => {
  const answers: Answers = { A01: { choices: ['A'] } };
  await page.route('**/api/admin/data', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockData(answers)) }),
  );
  await page.goto('/admin');
  await page.getByRole('button', { name: '秩序倾向分析', exact: true }).click();
  await page.getByRole('button', { name: '可视化图表' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出六维平均分分布 PNG' }).click();
  const file = await pending;
  const path = `artifacts/distributions-${test.info().project.name}.png`;
  await file.saveAs(path);
  expect(file.suggestedFilename()).toBe('六维度平均分分布.png');
  const data = await readFile(path);
  expect(data.readUInt32BE(16)).toBe(2400);
});
