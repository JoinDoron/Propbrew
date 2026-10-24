import ControlCenterPage from '../control-center/page';
import { requireWorkspace } from '@/server/workspaces';
import { withDurableRead } from '@/server/data/durable-records';

export default async function FacilityPortalPage() {
  return withDurableRead(async () => {
  await requireWorkspace('facility');
  return <ControlCenterPage />;
  });
}
