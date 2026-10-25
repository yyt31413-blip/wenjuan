import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.dev.vars') || existsSync('LOCAL-ADMIN.txt')) {
  console.log('Local credentials already exist; nothing overwritten. See LOCAL-ADMIN.txt.');
} else {
  const email = 'admin@localhost.test',
    password = randomBytes(24).toString('base64url'),
    salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, 32, {
    N: 16384,
    r: 8,
    p: 5,
    maxmem: 32 * 1024 * 1024,
  }).toString('hex');
  const hash = `scrypt$16384$8$5$${salt}$${key}`;
  writeFileSync(
    '.dev.vars',
    `ADMIN_EMAIL=${email}\nADMIN_PASSWORD_HASH='${hash}'\nSESSION_SECRET=${randomBytes(32).toString('hex')}\n`,
    { flag: 'wx' },
  );
  writeFileSync(
    'LOCAL-ADMIN.txt',
    `仅供本机测试，请勿上传 GitHub。\n后台：http://localhost:3000/admin\n邮箱：${email}\n密码：${password}\n\n.dev.vars 保存密码摘要与会话密钥；此文件供查看本地登录信息。\n正式上线时另行设置账号和 Cloudflare Secrets。\n`,
    { flag: 'wx' },
  );
  console.log('Local credentials generated. Read LOCAL-ADMIN.txt; values are not printed to logs.');
}
