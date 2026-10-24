import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('passes promotion inputs as inert arguments and keeps the token out of the command line', () => {
  const directory = mkdtempSync(join(tmpdir(), 'propbrew-promotion-'));
  try {
    const sentinel = join(directory, 'unexpected-shell-execution');
    const output = join(directory, 'arguments.json');
    const deployment = `https://staging.vercel.app/$(touch ${sentinel})`;
    const scope = `team " $(touch ${sentinel})`;
    const token = 'unit-test-vercel-token';
    const workflow = readFileSync('.github/workflows/staging-promotion.yml', 'utf8');
    const command = workflow.match(/- name: Promote validated artifact\n\s+run: (.+)/)?.[1];
    expect(command).toBeTruthy();
    const rendered = command!
      .replaceAll('${{ inputs.deployment_url }}', deployment)
      .replaceAll('${{ secrets.VERCEL_SCOPE }}', scope)
      .replaceAll('${{ secrets.VERCEL_TOKEN }}', token);
    writeFileSync(join(directory, 'npx'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.ARGUMENT_CAPTURE, JSON.stringify({ argv: process.argv.slice(2), token: process.env.VERCEL_TOKEN }));\n', { mode: 0o700 });
    const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', rendered], {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, ARGUMENT_CAPTURE: output, DEPLOYMENT_URL: deployment, VERCEL_SCOPE: scope, VERCEL_TOKEN: token },
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
