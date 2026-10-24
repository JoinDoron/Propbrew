import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

type WorkflowStep = { name?: string; run?: string; env?: Record<string, string> };
type PromotionWorkflow = { jobs: { 'verify-and-promote': { steps: WorkflowStep[] } } };
const yaml = createRequire(import.meta.url)('js-yaml') as { load: (text: string) => unknown };

it('passes promotion inputs as inert arguments and keeps the token out of the command line', () => {
  const directory = mkdtempSync(join(tmpdir(), 'propbrew-promotion-'));
  try {
    const sentinel = join(directory, 'unexpected-shell-execution');
    const output = join(directory, 'arguments.json');
    const deployment = `https://staging.vercel.app/$(touch ${sentinel})`;
    const scope = `team " $(touch ${sentinel})`;
    const token = 'unit-test-vercel-token';
    // Parse the entire workflow, including informational steps, before testing its shell command.
    const workflow = yaml.load(readFileSync('.github/workflows/staging-promotion.yml', 'utf8')) as PromotionWorkflow;
    const promotion = workflow.jobs['verify-and-promote'].steps.find((step) => step.name === 'Promote validated artifact');
    expect(promotion?.run).toBeTruthy();
    const render = (text: string) => text
      .replaceAll('${{ inputs.deployment_url }}', deployment)
      .replaceAll('${{ secrets.VERCEL_SCOPE }}', scope)
      .replaceAll('${{ secrets.VERCEL_TOKEN }}', token);
    const rendered = render(promotion!.run!);
    const environment = Object.fromEntries(Object.entries(promotion!.env ?? {}).map(([key, value]) => [key, render(value)]));
    writeFileSync(join(directory, 'npx'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.ARGUMENT_CAPTURE, JSON.stringify({ argv: process.argv.slice(2), token: process.env.VERCEL_TOKEN }));\n', { mode: 0o700 });
    const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', rendered], {
      env: { NODE_ENV: 'test', PATH: `${directory}:${process.env.PATH}`, ARGUMENT_CAPTURE: output, ...environment },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(sentinel)).toBe(false);
    const captured = JSON.parse(readFileSync(output, 'utf8')) as { argv: string[]; token: string };
    expect(captured.argv).toEqual(['vercel@latest', 'promote', deployment, `--scope=${scope}`]);
    expect(captured.argv.join(' ')).not.toContain(token);
    expect(captured.token).toBe(token);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
