import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { siteHealth } from '@/domain/facility';
import { ControlCenter, type SystemRow, type SensorRow, type AlarmRow } from '@/components/facility/control-center';

/** Facility Control Center — a live building-operations command centre. Composite
 *  site health, live sensors (water/fuel/temp/power/occupancy), building-system
 *  status, and an active-alarm feed where one tap dispatches a work order. */
export default async function ControlCenterPage() {
  const { actor } = await requireCapability('assets_ppm');
  const sites = new Map<string, string>(repos.sites.all(actor).map((s) => [s.id, s.name]));
  const systems = repos.buildingSystems.list(actor).items;
  const sensors = repos.facilitySensors.list(actor).items;
  const alarms = repos.facilityAlarms.list(actor).items;

  const health = siteHealth(systems);
  const water = sensors.find((s) => s.kind === 'water_tank');
  const power = sensors.find((s) => s.kind === 'power_source');

  const systemRows: SystemRow[] = systems.map((s) => ({ id: s.id, name: s.name, category: s.category, status: s.status, detail: s.detail, siteName: sites.get(s.siteId) ?? '' }));
  const sensorRows: SensorRow[] = sensors.map((s) => ({ id: s.id, name: s.name, kind: s.kind, value: s.value, unit: s.unit, low: s.low, high: s.high, drift: s.drift, text: s.text, siteName: sites.get(s.siteId) ?? '' }));
  const alarmRows: AlarmRow[] = [...alarms].sort((a, b) => (a.acknowledged === b.acknowledged ? (a.atISO < b.atISO ? 1 : -1) : a.acknowledged ? 1 : -1)).map((a) => ({ id: a.id, system: a.system, severity: a.severity, message: a.message, atISO: a.atISO, acknowledged: a.acknowledged, woRef: a.woRef }));

  return (
    <div className="max-w-[1150px] mx-auto">
      <ControlCenter
        health={health}
        systems={systemRows}
        sensors={sensorRows}
        alarms={alarmRows}
        kpis={{ operational: systems.filter((s) => s.status === 'operational' || s.status === 'standby').length, total: systems.length, powerSource: power?.text ?? '—', waterPct: water?.value ?? 0 }}
        nowMs={NOW_MS}
      />
    </div>
  );
}
