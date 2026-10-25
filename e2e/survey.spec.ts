import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const questions = JSON.parse(readFileSync('src/data/questionnaire.json', 'utf8')).questions as {
  id: string;
  multiple: boolean;
  options: { value: string }[];
}[];
const option = (page: Page, code: string) =>
  page
    .locator('.option')
    .filter({ has: page.locator('.option-code', { hasText: new RegExp('^' + code + '$') }) });
async function consent(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '开始填写' }).click();
  await option(page, 'A').click();
  await expect(page.locator('.question-meta')).toContainText('A02');
}
async function answerTo(page: Page, id: string) {
  for (let attempt = 0; attempt < questions.length; attempt++) {
    const current = await page.locator('.question-meta .mint').innerText();
    if (current === id) return;
    const q = questions.find((item) => item.id === current)!;
    await option(page, q.options[0].value).click();
    await page.getByRole('button', { name: q.multiple ? '完成选择' : '下一题' }).click();
  }
  throw new Error('Target question was not reached: ' + id);
}

test('首页、单选延迟、返回保留、顶部进度、触屏无横向溢出', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.getByRole('button', { name: '开始填写' })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await page.screenshot({
    path: `artifacts/home-${test.info().project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '开始填写' }).click();
  await expect(page.locator('.question-meta')).toContainText('A01');
  await expect(page.locator('.option').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.option').first()).toHaveCSS('color', 'rgb(0, 0, 0)');
  await option(page, 'A').click();
  await expect(page.locator('.option.selected')).toBeVisible();
  await expect(page.locator('.question-meta')).toContainText('A02');
  await option(page, 'B').click();
  await expect(page.locator('.question-meta')).toContainText('A03');
  await page.getByRole('button', { name: '上一题' }).click();
  await expect(option(page, 'B')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await answerTo(page, 'B01');
  await page.screenshot({
    path: `artifacts/question-${test.info().project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.locator('.question h1').count()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('其他文字不自动跳转，多选排他与C02/C03联动', async ({ page }) => {
  await consent(page);
  await answerTo(page, 'A04');
  await option(page, 'E').click();
  await page.waitForTimeout(500);
  await expect(page.locator('.question-meta')).toContainText('A04');
  await page.getByRole('textbox').fill('绘画');
  await page.getByRole('button', { name: '下一题' }).click();
  await option(page, 'A').click();
  await option(page, 'F').click();
  await expect(option(page, 'A')).toHaveAttribute('aria-pressed', 'false');
  await expect(option(page, 'F')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
  await expect(page.locator('.question-meta')).toContainText('A05');
  await page.getByRole('button', { name: '完成选择' }).click();
  await answerTo(page, 'C01');
  await expect(page.getByRole('img', { name: /问卷原始桌面照片/ })).toBeVisible();
  expect(
    await page
      .getByRole('img', { name: /问卷原始桌面照片/ })
      .evaluate((e: HTMLImageElement) => e.naturalWidth),
  ).toBe(1448);
  await page.screenshot({
    path: `artifacts/photo-${test.info().project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await option(page, 'A').click();
  await page.getByRole('button', { name: '下一题' }).click();
  for (const c of ['A', 'B', 'C']) await option(page, c).click();
  await option(page, 'D').click();
  await expect(page.locator('main').getByRole('alert')).toContainText('最多');
  await expect(page.locator('.option.selected')).toHaveCount(3);
  await page.getByRole('button', { name: '完成选择' }).click();
  await expect(page.locator('.option')).toHaveCount(3);
  await option(page, 'C').click();
  await expect(page.locator('.question-meta')).toContainText('C04');
  await page.getByRole('button', { name: '上一题' }).click();
  await page.getByRole('button', { name: '上一题' }).click();
  await option(page, 'C').click();
  await page.getByRole('button', { name: '完成选择' }).click();
  await expect(page.locator('.option')).toHaveCount(2);
  await expect(page.locator('.option.selected')).toHaveCount(0);
});
test('42题逐题作答；失败保留作答，成功后礼花结束', async ({ page }) => {
  await page.route('**/api/responses', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: '测试网络失败，答案已保留。' }),
    }),
  );
  await consent(page);
  await answerTo(page, 'D01');
  await expect(page.getByRole('button', { name: '提交问卷' })).toBeEnabled();
  await option(page, 'A').click();
  await page.getByRole('button', { name: '提交问卷' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('测试网络失败');
  await expect(page.locator('.thanks')).toHaveCount(0);
  await page.unroute('**/api/responses');
  let requests = 0;
  await page.route('**/api/responses', (route) => {
    requests++;
    const payload = route.request().postDataJSON();
    expect(payload.answers.A01.choices).toEqual(['A']);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ saved: true, id: 'test-only' }),
    });
  });
  await page.getByRole('button', { name: '提交问卷' }).click();
  await expect(page.getByRole('heading', { name: '感谢您的参与！' })).toBeVisible();
  await page.waitForTimeout(3200);
  await expect(page.locator('.confetti')).toBeHidden();
  await expect(page.getByText('您的回答已成功提交。')).toBeVisible();
  expect(requests).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('desktop-order-survey-v1'))).toBeNull();
});
test('减少动态效果下仍显示成功反馈', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await consent(page);
  await answerTo(page, 'D01');
  await expect(page.getByRole('button', { name: '提交问卷' })).toBeEnabled();
  await page.route('**/api/responses', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: '{"saved":true}' }),
  );
  await page.getByRole('button', { name: '提交问卷' }).click();
  await expect(page.getByRole('heading', { name: '感谢您的参与！' })).toBeVisible();
  await expect(page.locator('.confetti')).toBeHidden();
});
