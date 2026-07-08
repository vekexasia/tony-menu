import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const root = normalize(join(process.cwd(), process.argv[2] || 'web/out'));
const port = Number(process.argv[3] || process.env.PORT || 3000);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

function resolvePath(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return null;
  }
  let full = normalize(join(root, pathname));
  if (!full.startsWith(root + sep) && full !== root) return null;
  if (existsSync(full) && statSync(full).isDirectory()) full = join(full, 'index.html');
  if (!existsSync(full) && existsSync(`${full}.html`)) full = `${full}.html`;
  return full;
}

const server = createServer((req, res) => {
  const full = resolvePath(req.url || '/');
  if (!full || !existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404).end('Not Found');
    return;
  }
  res.writeHead(200, { 'content-type': types.get(extname(full)) || 'application/octet-stream' });
  if (req.method === 'HEAD') res.end();
  else createReadStream(full).pipe(res);
});

server.listen(port, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  console.log(`TonyMenu web listening on :${actualPort}`);
});
