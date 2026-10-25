import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const questions = JSON.parse(readFileSync('src/data/questionnaire.json', 'utf8')).questions as {
  id: string;
  multiple: boolean;
  options: { value: string }[];
}[];
test.skip(!process.env.WORKER_E2E, 'Run with npm run test:e2e:worker');
test.use({ trace: 'off' }); // Do not record locally generated login credentials.
test('real Worker/D1: browser submission, login, aggregate data and revocation', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始填写' }).click();
  for (const q of questions.slice(0, -1)) {
    await page
      .locator('.option')
      .filter({
        has: page.locator('.option-code', { hasText: new RegExp('^' + q.options[0].value + '$') }),
      })
      .click();
    await page.getByRole('button', { name: q.multiple ? '完成选择' : '下一题' }).click();
  }
  await expect(page.locator('.question-meta')).toContainText('D01');
  await expect(page.getByRole('button', { name: '提交问卷' })).toBeEnabled();
  const savedPromise = page.waitForResponse(
    (r) => r.url().endsWith('/api/responses') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '提交问卷 →' }).click();
  const saved = await savedPromise;
  expect(saved.status()).toBe(201);
  const result = await saved.json();
  expect(result.saved).toBe(true);
  await expect(page.getByRole('heading', { name: '感谢您的参与！' })).toBeVisible();
  expect((await context.request.get('/api/admin/data')).status()).toBe(401);
  await page.goto('/admin');
  const credentials = readFileSync('LOCAL-ADMIN.txt', 'utf8');
  const email = credentials.match(/邮箱：(.+)/)![1].trim(),
    password = credentials.match(/密码：(.+)/)![1].trim();
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录 →' }).click();
  await expect(page.getByRole('heading', { name: '数据总览', exact: true })).toBeVisible();
  const data = await context.request.get('/api/admin/data');
  expect(data.status()).toBe(200);
  const body = await data.json();
  expect(body.stats.total).toBe(1);
  expect(
    body.stats.cQuestionStats.find((q: { id: string }) => q.id === 'C01').options[0].count,
  ).toBe(1);
  expect(body).not.toHaveProperty('latest');
  expect(body).not.toHaveProperty('reviews');
  expect(body).not.toHaveProperty('responses');
  expect(JSON.stringify(body)).not.toContain('"answers"');
  const key = crypto.randomUUID(),
    answers = Object.fromEntries(
      questions.map((q) => [q.id, { choices: [q.id === 'B01' ? '5' : q.options[0].value] }]),
    );
  const retries = await Promise.all(
    Array.from({ length: 5 }, () =>
      context.request.post('/api/responses', {
        headers: { Origin: 'http://localhost:3000' },
        data: { submissionKey: key, answers },
      }),
    ),
  );
  for (const response of retries) expect(response.status()).toBe(201);
  const ids = await Promise.all(retries.map((r) => r.json().then((j) => j.id)));
  expect(new Set(ids).size).toBe(1);
  const afterRetries = await context.request.get('/api/admin/data');
  const afterBody = await afterRetries.json();
  expect(afterBody.stats.total).toBe(2);
  expect(
    afterBody.stats.cQuestionStats.find((q: { id: string }) => q.id === 'C01').options[0].count,
  ).toBe(2);
  expect((await context.request.get('/api/admin/export?format=xlsx')).status()).toBe(404);
  const cookies = await context.cookies(),
    session = cookies.find((c) => c.name === 'survey-admin-session')!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe('Strict');
  expect(
    (
      await context.request.post('/api/admin/logout', {
        headers: { Origin: 'http://localhost:3000' },
      })
    ).status(),
  ).toBe(200);
  await context.addCookies([session]);
  expect((await context.request.get('/api/admin/data')).status()).toBe(401);
});
