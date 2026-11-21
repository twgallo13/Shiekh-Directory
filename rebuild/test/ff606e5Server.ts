import { spawn, type ChildProcess } from 'child_process';
import { existsSync, symlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const worktree = '/tmp/shkdir-ff606e5';

function ensureWorktree(): void {
  if (!existsSync(join(worktree, 'rebuild/server/index.ts'))) {
    execFileSync('git', ['worktree', 'add', '--detach', worktree, 'ff606e5'], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  }
  const modules = join(worktree, 'rebuild/node_modules');
  if (!existsSync(modules)) {
    symlinkSync(join(repoRoot, 'rebuild/node_modules'), modules);
  }
}

async function waitForHealth(port: number, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  let last = '';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`ff606e5 server exited ${child.exitCode}: ${last}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`ff606e5 server did not become healthy: ${last}`);
}

export async function startFf606e5Server(port: number): Promise<ChildProcess> {
  ensureWorktree();
  let log = '';
  const child = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: join(worktree, 'rebuild'),
    env: {
      ...process.env,
      PORT: String(port),
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const remember = (chunk: Buffer) => {
    log = `${log}${chunk}`.slice(-2000);
  };
  child.stdout?.on('data', remember);
  child.stderr?.on('data', remember);
  try {
    await waitForHealth(port, child);
  } catch (error) {
    child.kill('SIGTERM');
    throw new Error(`${error instanceof Error ? error.message : error}\n${log}`);
  }
  return child;
}

export function stopChild(child: ChildProcess | undefined): void {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
}
