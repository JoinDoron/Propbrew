import { redirect } from 'next/navigation';
import { getActor } from '@/server/session';
import { homeRouteFor } from '@/config/shells';

/** The root sends each actor to their shell's home (SC-06). A real (public)
 *  landing page (SC-11) replaces this in Phase 2. */
export default async function RootPage() {
  const actor = await getActor();
  redirect(homeRouteFor(actor));
}
