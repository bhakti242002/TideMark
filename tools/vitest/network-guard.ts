import net from 'node:net';

// Rule 4: tests run on fixtures only. Loopback stays open so later milestones
// can test the MCP server over a local transport.
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1']);
const INSTALLED = Symbol.for('tidemark.networkGuard');

export class NetworkBlockedError extends Error {
  constructor(target: string) {
    super(`Network access blocked in tests: ${target}. Use fixtures, or a loopback or path-based connection.`);
    this.name = 'NetworkBlockedError';
  }
}

export function isLoopbackHost(host: string): boolean {
  // URL.hostname keeps the brackets around IPv6 literals.
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  return LOOPBACK_HOSTS.has(bare.toLowerCase());
}

export type ConnectTarget =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'host'; readonly host: string };

// Socket#connect accepts (options), (port, host?), (path) and, when called from
// net.connect, a single pre-normalized [options, callback] array.
export function connectTarget(args: readonly unknown[]): ConnectTarget {
  const normalized: unknown = args[0];
  const first: unknown = Array.isArray(normalized) ? normalized[0] : normalized;
  const second: unknown = Array.isArray(normalized) ? undefined : args[1];

  if (typeof first === 'object' && first !== null) {
    const { path, host } = first as { path?: unknown; host?: unknown };
    if (typeof path === 'string') return { kind: 'path', path };
    // Node connects to localhost when no host is given.
    return { kind: 'host', host: typeof host === 'string' ? host : 'localhost' };
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { kind: 'path', path: first };
  return { kind: 'host', host: typeof second === 'string' ? second : 'localhost' };
}

export function isAllowedConnect(target: ConnectTarget): boolean {
  // Named pipes and Unix sockets never leave the machine.
  return target.kind === 'path' || isLoopbackHost(target.host);
}

function fetchUrl(input: Parameters<typeof fetch>[0]): URL {
  return new URL(input instanceof Request ? input.url : String(input));
}

// Setup files run once per test file but node:net is shared by the worker,
// so installing twice would stack wrappers.
export function installNetworkGuard(): void {
  const registry = globalThis as typeof globalThis & { [INSTALLED]?: true };
  if (registry[INSTALLED]) return;
  registry[INSTALLED] = true;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = fetchUrl(input);
    const remote = (url.protocol === 'http:' || url.protocol === 'https:') && !isLoopbackHost(url.hostname);
    return remote ? Promise.reject(new NetworkBlockedError(url.host)) : realFetch(input, init);
  };

  // http, https, tls and undici all open sockets through Socket#connect.
  const realConnect = net.Socket.prototype.connect;
  const guardedConnect = function (this: net.Socket, ...args: unknown[]): net.Socket {
    const target = connectTarget(args);
    if (!isAllowedConnect(target)) {
      throw new NetworkBlockedError(target.kind === 'host' ? target.host : target.path);
    }
    return Reflect.apply(realConnect, this, args) as net.Socket;
  };
  net.Socket.prototype.connect = guardedConnect as typeof realConnect;
}
