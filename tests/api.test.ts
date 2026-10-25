vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { APP_ORIGIN: 'http://localhost:3000' } }),
}));
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
import { POST } from '../src/app/api/responses/route';
import { GET as dataGET } from '../src/app/api/admin/data/route';
import { questions } from '../src/lib/questions';
const request = (body: unknown, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
describe('接口保护与配置失败', () => {
  it('跨站写请求被拒绝', async () =>
    expect((await POST(request({}, 'https://evil.example'))).status).toBe(403));
  it('无效作答在访问数据库前被拒绝', async () =>
    expect((await POST(request({}))).status).toBe(400));
  it('未配置数据库必须失败，不能假成功', async () => {
    const r = await POST(
      request({
        submissionKey: crypto.randomUUID(),
        answers: Object.fromEntries(
          questions.map((q) => [q.id, { choices: [q.options[0].value] }]),
        ),
      }),
    );
    expect(r.status).toBe(503);
    expect(await r.json()).not.toHaveProperty('saved');
  });
  it('未登录不能读统计', async () => expect((await dataGET()).status).toBe(401));
  it('过大请求被拒绝', async () =>
    expect((await POST(request({ text: 'x'.repeat(33000) }))).status).toBe(413));
});
