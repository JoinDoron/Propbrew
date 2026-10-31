'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { assertCan } from '@/lib/authz';
import { canEnterWorkspace } from '@/config/workspaces';
import { forecastFinishISO, projectEVMOf } from '@/domain/construction';
import { withDurableMutation } from '@/server/data/durable-records';
import { scopedConstructionProjectGet } from '@/server/data';
import { constructionForecastSnapshots } from '@/server/construction/forecast-evaluations';
import { constructionWorld } from '@/server/reads/construction';
import { operatingNowISO } from '@/server/operating-clock';
import { getActor } from '@/server/session';

export async function recordConstructionForecastSnapshot(projectId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return withDurableMutation(async () => {
    const actor = await getActor();
    if (!actor.tenantId || !canEnterWorkspace(actor, 'construction')) return { ok: false, error: 'Construction access is required.' };
    try { assertCan(actor, 'reports_analytics', 'create'); } catch { return { ok: false, error: 'Your role cannot record forecasts.' }; }
    const project = scopedConstructionProjectGet(actor, projectId, 'create');
    if (!project || project.status === 'planning' || project.status === 'completed') return { ok: false, error: 'Choose an active or closing assigned project.' };
    const world = constructionWorld(actor);
    const evm = projectEVMOf(project, world.costCodes.filter((row) => row.projectId === project.id));
    const finish = forecastFinishISO(project, evm.spi);
    if (!Number.isSafeInteger(evm.eac) || evm.eac <= 0) return { ok: false, error: 'Add cost-code and progress evidence before recording a forecast.' };
    const ledger = constructionForecastSnapshots(true), at = operatingNowISO();
    if (ledger.some((row) => row.tenantId === actor.tenantId && row.projectId === projectId && row.recordedAtISO.slice(0, 10) === at.slice(0, 10))) return { ok: false, error: 'This project already has a forecast snapshot today.' };
    ledger.push({ id: randomUUID(), tenantId: actor.tenantId, projectId, projectName: project.name, recordedAtISO: at,
      predictedFinishISO: finish.iso, predictedCostMinor: evm.eac, baselineFinishISO: project.plannedFinishISO,
      cpi: evm.cpi, spi: evm.spi, recordedBy: actor.userId });
    revalidatePath('/construction/operations');
    return { ok: true };
  }, 'construction');
}
