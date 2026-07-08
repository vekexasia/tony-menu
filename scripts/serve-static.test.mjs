import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./serve-static.mjs', import.meta.url));

function request(port, path) {
  return new Promise((resolve, reject) => {
    http
      .get({ port, path }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      })
      .on('error', reject);
  });
}
async function startedPort(server) {
  return await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', () => reject(new Error('server exited before accepting requests')));
    server.stdout.once('data', (chunk) => {
      const match = String(chunk).match(/:(\d+)/);
      if (!match) reject(new Error('server did not print a port'));
      else resolve(Number(match[1]));
    });
  });
}

test('malformed percent-encoded URL returns 404 instead of crashing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tony-static-'));
  writeFileSync(join(dir, 'index.html'), 'ok');
  const server = spawn(process.execPath, [scriptPath, dir, '0']);
  const port = await startedPort(server);

  try {
    assert.equal(await request(port, '/%E0%A4%A'), 404);
    assert.equal(server.exitCode, null);
  } finally {
    server.kill();
  }
});
