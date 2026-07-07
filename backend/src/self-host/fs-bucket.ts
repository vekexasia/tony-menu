import { createReadStream } from 'node:fs';
import type { Dirent } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';

function safePath(root: string, key: string): string {
  const full = normalize(join(root, key));
  const normalizedRoot = normalize(root + sep);
  if (!full.startsWith(normalizedRoot)) throw new Error('Invalid object key');
  return full;
}

function object(root: string, key: string, data: Buffer, contentType?: string): R2ObjectBody {
  return {
    key,
    version: '',
    size: data.byteLength,
    etag: String(data.byteLength),
    httpEtag: String(data.byteLength),
    uploaded: new Date(),
    httpMetadata: contentType ? { contentType } : {},
    customMetadata: {},
    checksums: {},
    range: undefined,
    body: Readable.toWeb(createReadStream(safePath(root, key))) as ReadableStream,
    bodyUsed: false,
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    blob: async () => new Blob([data], { type: contentType }),
    json: async () => JSON.parse(data.toString('utf8')),
    text: async () => data.toString('utf8'),
    writeHttpMetadata(headers: Headers) {
      if (contentType) headers.set('content-type', contentType);
    },
  } as R2ObjectBody;
}

async function walk(root: string, dir: string, prefix: string, out: R2Object[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, full, prefix, out);
      continue;
    }
    const key = full.slice(normalize(root + sep).length).replaceAll(sep, '/');
    if (!key.startsWith(prefix)) continue;
    const info = await stat(full);
    out.push({ key, version: '', size: info.size, etag: String(info.size), httpEtag: String(info.size), uploaded: info.mtime, httpMetadata: {}, customMetadata: {}, checksums: {} } as R2Object);
  }
}

export function createFsBucket(root: string): R2Bucket {
  return {
    async get(key: string) {
      try {
        const data = await readFile(safePath(root, key));
        const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
        const contentType = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.json': 'application/json', '.pdf': 'application/pdf' } as Record<string, string>)[ext];
        return object(root, key, data, contentType);
      } catch {
        return null;
      }
    },
    async put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions) {
      const full = safePath(root, key);
      await mkdir(dirname(full), { recursive: true });
      let data: Buffer;
      if (typeof value === 'string') data = Buffer.from(value);
      else if (value instanceof Blob) data = Buffer.from(await value.arrayBuffer());
      else if (value instanceof ReadableStream) data = Buffer.from(await new Response(value).arrayBuffer());
      else if (value instanceof ArrayBuffer) data = Buffer.from(value);
      else if (ArrayBuffer.isView(value)) data = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      else data = Buffer.alloc(0);
      await writeFile(full, data);
      const contentType = options?.httpMetadata instanceof Headers ? options.httpMetadata.get('content-type') ?? undefined : options?.httpMetadata?.contentType;
      return object(root, key, data, contentType);
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) await rm(safePath(root, key), { force: true });
    },
    async list(options?: R2ListOptions) {
      const objects: R2Object[] = [];
      await walk(root, root, options?.prefix ?? '', objects);
      return { objects, truncated: false, delimitedPrefixes: [], cursor: undefined };
    },
  } as unknown as R2Bucket;
}
