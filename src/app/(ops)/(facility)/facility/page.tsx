import ControlCenterPage from '../control-center/page';
import { requireWorkspace } from '@/server/workspaces';

export default async function FacilityPortalPage() {
  await requireWorkspace('facility');
  return <ControlCenterPage />;
}
