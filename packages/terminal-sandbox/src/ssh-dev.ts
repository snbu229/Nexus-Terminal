import { createHash, timingSafeEqual } from 'node:crypto';
import ssh2, { type Connection, type ParsedKey } from 'ssh2';

// ssh2 is CommonJS: take values from the default export so plain Node ESM works as well as vitest.
const { Client, Server, utils } = ssh2;
import { createLocalSandbox } from './local-sandbox.js';
import type { OpenOptions, TerminalProvider, TerminalProviderFactory } from './types.js';

export interface SshDevOptions {
  host: string;
  port: number;
  /** Hex SHA-256 of the server's raw host key blob. Empty or mismatching = connection refused. */
  pinnedHostKeySha256: string;
  /** Private key (OpenSSH PEM) used to authenticate. Ephemeral, memory only. */
  clientKey: string;
  username?: string;
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/** ssh2 client provider with a pinned host key. An unknown or changed key aborts before authentication. */
export function createSshDevProvider(o: SshDevOptions): TerminalProviderFactory {
  return {
    open({ cols, rows }: OpenOptions): Promise<TerminalProvider> {
      return new Promise((resolve, reject) => {
        const client = new Client();
        let settled = false;
        const fail = (err: Error) => {
          if (settled) return;
          settled = true;
          client.destroy();
          reject(err);
        };
        client.on('error', (e) => fail(e instanceof Error ? e : new Error(String(e))));
        client.on('close', () => fail(new Error('ssh connection closed before the shell opened')));
        client.on('ready', () => {
          client.shell({ cols, rows, term: 'xterm-256color' }, (err, stream) => {
            if (err) return fail(err);
            settled = true;
            const dataCbs: Array<(d: Uint8Array) => void> = [];
            // Output can arrive in the same read as the channel-open reply, before the caller has attached onData.
            const early: Uint8Array[] = [];
            const exitCbs: Array<(c: number) => void> = [];
            let exited = false;
            let code = 0;
            const finish = (c: number) => {
              if (exited) return;
              exited = true;
              code = c;
              exitCbs.forEach((cb) => cb(c));
              client.end();
            };
            stream.on('data', (d: Buffer) => {
              if (dataCbs.length === 0) early.push(d);
              else dataCbs.forEach((cb) => cb(d));
            });
            stream.on('exit', (c: number | null, sig?: string) => finish(c ?? (sig ? 129 : 1)));
            stream.on('close', () => finish(code));
            client.on('close', () => finish(code));
            stream.on('error', () => undefined);
            resolve({
              write: (data) => void (!exited && stream.write(data)),
              resize: (c, r) => void (!exited && stream.setWindow(r, c, 0, 0)),
              onData(cb) {
                dataCbs.push(cb);
                for (const d of early.splice(0)) cb(d);
              },
              onExit(cb) {
                if (exited) cb(code);
                else exitCbs.push(cb);
              },
              close() {
                if (!exited) finish(129);
                client.destroy();
                return Promise.resolve();
              },
            });
          });
        });
        try {
          client.connect({
            host: o.host,
            port: o.port,
            username: o.username ?? 'dev',
            privateKey: o.clientKey,
            hostHash: 'sha256',
            hostVerifier: (hash: string) => {
              const ok = sameHex(hash, o.pinnedHostKeySha256);
              if (!ok)
                fail(new Error('ssh host key does not match the pinned key; refusing to connect'));
              return ok;
            },
            readyTimeout: 10_000,
          });
        } catch (e) {
          fail(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
  };
}

export interface SshTestServer {
  port: number;
  /** Hex SHA-256 of the ephemeral host key; this is what a client pins. */
  hostKeySha256: string;
  /** Ephemeral client private key the server accepts. */
  clientPrivateKey: string;
  close(): Promise<void>;
}

/** ssh2's generateKeyPairSync occasionally (~0.3%) emits a private key its own parser rejects; retry. */
function generateParseableKeyPair() {
  for (let i = 0; i < 10; i++) {
    const kp = utils.generateKeyPairSync('ed25519');
    if (
      !(utils.parseKey(kp.private) instanceof Error) &&
      !(utils.parseKey(kp.public) instanceof Error)
    )
      return kp;
  }
  throw new Error('key generation failed');
}

/**
 * In-process ssh2 server on 127.0.0.1:<random> for dev and tests. Ephemeral ed25519 host and client keys live
 * in memory only. Accepts only the one client public key; every shell is a local-sandbox shell.
 */
export async function startSshTestServer(): Promise<SshTestServer> {
  const hostKey = generateParseableKeyPair();
  const clientKey = generateParseableKeyPair();
  const parsedHost = utils.parseKey(hostKey.private);
  const parsedClient = utils.parseKey(clientKey.public);
  if (parsedHost instanceof Error || parsedClient instanceof Error)
    throw new Error('key generation failed');
  const hostBlob = (Array.isArray(parsedHost) ? parsedHost[0] : parsedHost)?.getPublicSSH();
  if (!hostBlob) throw new Error('host key generation failed');
  const allowed = (Array.isArray(parsedClient) ? parsedClient[0] : parsedClient) as ParsedKey;
  const allowedBlob = allowed.getPublicSSH();
  const sandbox = createLocalSandbox();
  const live = new Set<TerminalProvider>();
  const conns = new Set<Connection>();

  const server = new Server({ hostKeys: [hostKey.private] }, (conn) => {
    conns.add(conn);
    conn.on('error', () => undefined);
    conn.on('close', () => conns.delete(conn));
    conn.on('authentication', (ctx) => {
      if (
        ctx.method === 'publickey' &&
        ctx.key.algo === allowed.type &&
        Buffer.compare(ctx.key.data, allowedBlob) === 0 &&
        (!ctx.signature || allowed.verify(ctx.blob as Buffer, ctx.signature, ctx.hashAlgo) === true)
      ) {
        return ctx.accept();
      }
      ctx.reject(['publickey']);
    });
    conn.on('ready', () => {
      conn.on('session', (accept) => {
        const session = accept();
        let size = { cols: 80, rows: 24 };
        let term: TerminalProvider | undefined;
        session.on('pty', (acceptPty, _rej, info) => {
          size = { cols: info.cols, rows: info.rows };
          acceptPty();
        });
        session.on('window-change', (acceptWc, _rej, info) => {
          acceptWc?.();
          size = { cols: info.cols, rows: info.rows };
          term?.resize(info.cols, info.rows);
        });
        session.on('shell', (acceptShell) => {
          const channel = acceptShell();
          void sandbox.open(size).then((t) => {
            term = t;
            live.add(t);
            t.onData((d) => channel.write(Buffer.from(d)));
            t.onExit((code) => {
              live.delete(t);
              channel.exit(code);
              channel.end();
            });
            channel.on('data', (d: Buffer) => t.write(d));
            channel.on('close', () => void t.close());
          });
        });
        // No exec, no subsystems, no forwarding: shell only.
      });
    });
  });
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  const addr = server.address();
  if (addr === null || typeof addr === 'string')
    throw new Error('ssh test server failed to listen');
  return {
    port: addr.port,
    hostKeySha256: createHash('sha256').update(hostBlob).digest('hex'),
    clientPrivateKey: clientKey.private,
    async close() {
      for (const t of live) await t.close();
      for (const c of conns) c.end();
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}
