import Survey from '@/components/Survey';
import { environment } from '@/lib/server/cloudflare';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const env = await environment();
  return <Survey registrationUrl={env.INTERVIEW_REGISTRATION_URL || null} />;
}
