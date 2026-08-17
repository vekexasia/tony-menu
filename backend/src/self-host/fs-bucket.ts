import * as fs from 'fs';
import * as path from 'path';

export function createFsBucket(dirPath: string) {
  return {
    async head(key: string) {
      const fullPath = path.join(dirPath, key);
      if (!fs.existsSync(fullPath)) return null;
      const stats = fs.statSync(fullPath);
      return {
        key,
        size: stats.size,
        etag: `"${stats.mtimeMs}"`,
        uploaded: stats.mtime,
        httpMetadata: {},
        customMetadata: {},
      };
    },

    async get(key: string) {
      const fullPath = path.join(dirPath, key);
      if (!fs.existsSync(fullPath)) return null;
      const data = fs.readFileSync(fullPath);
      return {
        body: data,
        arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
        blob: async () => new Blob([data]) as Blob,
        json: async () => JSON.parse(Buffer.from(data).toString('utf8')),
        text: async () => Buffer.from(data).toString('utf8'),
        writeHttpMetadata(headers: Headers) {},
      };
    },

    async put(key: string, value: any) {
      const fullPath = path.join(dirPath, key);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      let buf: Buffer;
      if (typeof value === 'string') {
        buf = Buffer.from(value);
      } else if (value instanceof Uint8Array) {
        buf = Buffer.from(value);
      } else if (value && typeof value.arrayBuffer === 'function') {
        buf = Buffer.from(await value.arrayBuffer());
      } else {
        buf = Buffer.from(value);
      }
      fs.writeFileSync(fullPath, buf);
      const stats = fs.statSync(fullPath);
      return {
        key,
        size: stats.size,
        etag: `"${stats.mtimeMs}"`,
        uploaded: stats.mtime,
      };
    },

    async delete(keys: string | string[]) {
      const keysArr = Array.isArray(keys) ? keys : [keys];
      for (const k of keysArr) {
        const fullPath = path.join(dirPath, k);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    },

    async list() {
      return { objects: [], truncated: false, delimitedPrefixes: [] };
    },
  } as any;
}
