import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { agentPerformance } from '@/domain/shortlet';
import { AgentsWorkspace, type AgentRow } from '@/components/shortlet/agents-workspace';

/** Agents (flow idea) — booking-agent directory with performance and commission.
 *  Bookings recorded against an agent name roll up into their revenue + what you
 *  owe. Invite agents by WhatsApp. */
export default async function ShortletAgentsPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const agents = repos.shortletAgents.list(actor).items;
  const bookings = repos.shortletBookings.list(actor).items;

  const rows: AgentRow[] = agentPerformance(agents, bookings).map((p) => ({
    id: p.agent.id, name: p.agent.name, phone: p.agent.phone, commissionPct: p.agent.commissionPct, status: p.agent.status,
    bookings: p.bookings, nights: p.nights, revenueMinor: p.revenueMinor, commissionMinor: p.commissionMinor,
  }));

  return (
    <div className="max-w-[820px] mx-auto">
      <AgentsWorkspace agents={rows} />
    </div>
  );
}
