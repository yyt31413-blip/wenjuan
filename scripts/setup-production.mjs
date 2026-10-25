import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

if (existsSync('.prod-secrets') || existsSync('PROD-ADMIN.txt')) {
  throw new Error('Production credentials already exist; refusing to overwrite them.');
}

const email = (process.env.PRODUCTION_ADMIN_EMAIL ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Set PRODUCTION_ADMIN_EMAIL to the administrator email before running.');
}
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16).toString('hex');
const key = scryptSync(password, salt, 32, {
  N: 16384,
  r: 8,
  p: 5,
  maxmem: 32 * 1024 * 1024,
}).toString('hex');
const hash = `scrypt$16384$8$5$${salt}$${key}`;
const secret = randomBytes(32).toString('hex');

writeFileSync(
  '.prod-secrets',
  `ADMIN_EMAIL=${email}\nADMIN_PASSWORD_HASH=${hash}\nSESSION_SECRET=${secret}\n`,
  { flag: 'wx' },
);
writeFileSync(
  'PROD-ADMIN.txt',
  `Cloudflare 线上管理员凭据，请妥善保管，不要上传 GitHub。\n后台：https://wenjuan-survey-yyt31413.pages.dev/admin\n邮箱：${email}\n密码：${password}\n`,
  { flag: 'wx' },
);
console.log('Production credentials generated in ignored local files. Values are not printed.');
