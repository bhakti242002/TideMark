import { createServer as createHttpServer } from 'node:http';
import { connect, createServer as createNetServer, type ListenOptions, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { connectTarget, isAllowedConnect, isLoopbackHost } from './network-guard.js';

describe('isLoopbackHost', () => {
  test.each(['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]'])('allows %s', (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });
  test.each(['example.invalid', '203.0.113.1', '10.0.0.1', '127.0.0.2', '0.0.0.0', ''])('blocks %s', (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe('connectTarget', () => {
  test('reads host from options', () => {
    expect(connectTarget([{ host: '203.0.113.1', port: 443 }])).toEqual({ kind: 'host', host: '203.0.113.1' });
  });
  test('reads net.connect pre-normalized args', () => {
    expect(connectTarget([[{ host: '203.0.113.1', port: 443 }, null]])).toEqual({
      kind: 'host',
      host: '203.0.113.1',
    });
  });
  test('reads (port, host)', () => {
    expect(connectTarget([443, '203.0.113.1'])).toEqual({ kind: 'host', host: '203.0.113.1' });
  });
  test('defaults a bare port to localhost', () => {
    expect(connectTarget([8080])).toEqual({ kind: 'host', host: 'localhost' });
    expect(connectTarget(['8080'])).toEqual({ kind: 'host', host: 'localhost' });
  });
  test('treats path options and path strings as path-based', () => {
    expect(connectTarget([{ path: '/tmp/x.sock' }])).toEqual({ kind: 'path', path: '/tmp/x.sock' });
    expect(connectTarget(['\\\\.\\pipe\\x'])).toEqual({ kind: 'path', path: '\\\\.\\pipe\\x' });
  });
  test('allows path-based targets and blocks remote hosts', () => {
    expect(isAllowedConnect({ kind: 'path', path: '/tmp/x.sock' })).toBe(true);
    expect(isAllowedConnect({ kind: 'host', host: '203.0.113.1' })).toBe(false);
  });
});

// These run against the guard installed by setup.ts, so they prove it is active.
// 203.0.113.0/24 is a documentation range (TEST-NET-3), in case the guard ever fails open.
describe('installed guard', () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.destroy();
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((done) => s.close(() => done()))));
  });

  function listen(server: Server, options: ListenOptions): Promise<void> {
    servers.push(server);
    return new Promise((done) => server.listen(options, () => done()));
  }

  function connected(socket: Socket): Promise<void> {
    sockets.push(socket);
    return new Promise((done, fail) => socket.once('connect', done).once('error', fail));
  }

  test('rejects fetch to a remote host', async () => {
    await expect(fetch('https://203.0.113.1/')).rejects.toThrow(/Network access blocked/);
  });

  test('throws on a raw TCP connect to a remote host', () => {
    expect(() => connect({ host: '203.0.113.1', port: 443 })).toThrow(/Network access blocked/);
  });

  test('allows fetch to a loopback server', async () => {
    const server = createHttpServer((_req, res) => res.end('ok'));
    await listen(server, { port: 0, host: '127.0.0.1' });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('expected a TCP address');
    const res = await fetch(`http://127.0.0.1:${address.port}/`);
    expect(await res.text()).toBe('ok');
  });

  test('allows a path-based connection (named pipe or Unix socket)', async () => {
    const path =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\tidemark-guard-${process.pid}-${Date.now()}`
        : join(tmpdir(), `tidemark-guard-${process.pid}-${Date.now()}.sock`);
    const server = createNetServer((socket) => socket.end());
    await listen(server, { path });
    await connected(connect({ path }));
  });
});
