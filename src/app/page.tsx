import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * There is no marketing landing page. Send visitors straight to sign-in, or
 * into the workspace if they already have a session.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? '/dashboard' : '/login');
}
