import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrubbedEnv } from './env.js';
import type { OpenOptions, TerminalProvider, TerminalProviderFactory } from './types.js';

const BRIDGE = fileURLToPath(new URL('./pty_bridge.py', import.meta.url));
const INTEGRATION = fileURLToPath(new URL('./shell-integration.bash', import.meta.url));

function findShell(path: string): { bin: string; bash: boolean } {
  for (const dir of path.split(':')) {
    if (existsSync(join(dir, 'bash'))) return { bin: join(dir, 'bash'), bash: true };
  }
  return { bin: existsSync('/bin/sh') ? '/bin/sh' : 'sh', bash: false };
}

/**
 * Local dev shell under a real PTY (via a Python-stdlib bridge), with a scrubbed environment, a temp HOME/cwd
 * and OSC 133 dev markers. NOT a security boundary: it runs as the API's own user.
 */
export function createLocalSandbox(): TerminalProviderFactory {
  return {
    async open({ cols, rows }: OpenOptions): Promise<TerminalProvider> {
      const dir = await mkdtemp(join(tmpdir(), 'nexus-sandbox-'));
      const env = scrubbedEnv(process.env, dir);
      const shell = findShell(env.PATH ?? '');
      let args: string[];
      if (shell.bash) {
        await copyFile(INTEGRATION, join(dir, '.nexus-integration.bash'));
        // `--rcfile` replaces ~/.bashrc, so this is `--norc` plus only our marker file.
        args = [shell.bin, '--noprofile', '--rcfile', join(dir, '.nexus-integration.bash'), '-i'];
      } else {
        args = [shell.bin, '-i'];
        env.PS1 = '$ ';
      }
      const child: ChildProcess = spawn('python3', [BRIDGE, String(cols), String(rows), ...args], {
        cwd: dir,
        env,
        stdio: ['pipe', 'pipe', 'ignore', 'pipe'],
      });
      const dataCbs: Array<(d: Uint8Array) => void> = [];
      const early: Uint8Array[] = [];
      const exitCbs: Array<(c: number) => void> = [];
      let exited = false;
      let exitCode = 0;
      let closing: Promise<void> | undefined;
      const cleanup = () => rm(dir, { recursive: true, force: true });
      const ctl = child.stdio[3] as NodeJS.WritableStream;
      for (const s of [child.stdin, ctl]) s?.on('error', () => undefined);

      child.stdout?.on('data', (d: Buffer) => {
        if (dataCbs.length === 0) early.push(d);
        else dataCbs.forEach((cb) => cb(d));
      });
      const done = new Promise<void>((resolve) => {
        child.once('error', () => {
          exited = true;
          exitCode = 127;
          resolve();
        });
        child.once('close', (code, signal) => {
          exited = true;
          exitCode = code ?? (signal ? 128 : 1);
          resolve();
        });
      });
      void done.then(() => {
        exitCbs.forEach((cb) => cb(exitCode));
        void cleanup();
      });

      return {
        write(data) {
          if (!exited) child.stdin?.write(data);
        },
        resize(c, r) {
          if (!exited) ctl.write(`resize ${Math.trunc(c)} ${Math.trunc(r)}\n`);
        },
        onData(cb) {
          dataCbs.push(cb);
          for (const d of early.splice(0)) cb(d);
        },
        onExit(cb) {
          if (exited) cb(exitCode);
          else exitCbs.push(cb);
        },
        close() {
          closing ??= (async () => {
            if (!exited) {
              child.kill('SIGTERM');
              const t = setTimeout(() => child.kill('SIGKILL'), 2000);
              await done;
              clearTimeout(t);
            }
            await cleanup();
          })();
          return closing;
        },
      };
    },
  };
}
