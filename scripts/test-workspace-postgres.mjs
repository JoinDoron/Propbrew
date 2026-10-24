import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

// Always creates and removes its own loopback-only cluster. It never reads or
// modifies the application's DATABASE_URL and never prints connection secrets.
const directory = await mkdtemp(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'propbrew-workspace-pg-'));
const data = join(directory, 'data');
const homebrew = '/opt/homebrew/bin/';
const program = (name) => process.platform === 'darwin' ? homebrew + name : name;
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.visible ? 'inherit' : ['ignore', 'pipe', 'pipe'], ...options });
    let output = '';
    child.stdout?.on('data', (part) => { output += part; }); child.stderr?.on('data', (part) => { output += part; });
    child.once('error', reject); child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${command.split('/').at(-1)} failed (${code}). ${output.slice(-3000)}`)));
  });
}
let started = false;
try {
  const port = await new Promise((resolve, reject) => { const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const address = socket.address(); socket.close(() => resolve(address.port)); }); });
  await run(program('initdb'), ['-D', data, '-U', 'propbrew_workspace_test_admin', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  await run(program('pg_ctl'), ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start']); started = true;
  await run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--no-file-parallelism',
    'tests/data/workspace-postgres.integration.test.ts', 'tests/data/native-postgres.integration.test.ts',
    'tests/data/company-accounts.integration.test.ts', 'tests/data/company-ai-budget.integration.test.ts',
    'tests/data/demo-sandboxes.integration.test.ts',
  ], { visible: true, env: { ...process.env, PROPBREW_TEST_DATABASE_URL: `postgresql://propbrew_workspace_test_admin@127.0.0.1:${port}/postgres` } });
} finally {
  if (started) await run(program('pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop']);
  await rm(directory, { recursive: true, force: true });
}
