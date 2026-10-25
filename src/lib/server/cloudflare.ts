import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from '@cloudflare/workers-types';
import { ServiceError } from './errors';
export type SurveyEnv = {
  DB?: D1Database;
  APP_ORIGIN?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
  INTERVIEW_REGISTRATION_URL?: string;
};
export async function environment(): Promise<SurveyEnv> {
  try {
    return (await getCloudflareContext({ async: true })).env as SurveyEnv;
  } catch {
    throw new ServiceError('Cloudflare 本地环境或服务绑定尚未配置。', 503);
  }
}
export async function appOrigin() {
  const { APP_ORIGIN } = await environment();
  if (!APP_ORIGIN) throw new ServiceError('网站来源尚未配置。', 503);
  let url: URL;
  try {
    url = new URL(APP_ORIGIN);
  } catch {
    throw new ServiceError('网站来源配置无效。', 503);
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new ServiceError('正式网站必须使用 HTTPS。', 503);
  return url.origin;
}
