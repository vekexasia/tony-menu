import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMigrations, createD1Compat } from '../self-host/sqlite';

describe('self-host sqlite D1 compat', () => {
  it('rolls back batch failures', async () => {
    const d1 = createD1Compat(new Database(':memory:'));
    await d1.exec('CREATE TABLE items (id TEXT PRIMARY KEY)');

    await expect(
      d1.batch([
        d1.prepare('INSERT INTO items (id) VALUES (?)').bind('a'),
        d1.prepare('INSERT INTO items (id) VALUES (?)').bind('a'),
      ]),
    ).rejects.toThrow();

    await expect(d1.prepare('SELECT COUNT(*) AS count FROM items').first('count')).resolves.toBe(0);
  });

  it('runs foreign-key-disabling migrations outside a transaction', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tony-migrations-'));
    writeFileSync(
      join(dir, '0000_init.sql'),
      `CREATE TABLE parent (id TEXT PRIMARY KEY);--> statement-breakpoint
CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id) ON DELETE CASCADE);--> statement-breakpoint
INSERT INTO parent (id) VALUES ('p1');--> statement-breakpoint
INSERT INTO child (id, parent_id) VALUES ('c1', 'p1');`,
    );
    writeFileSync(
      join(dir, '0001_recreate_parent.sql'),
      `PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE new_parent (id TEXT PRIMARY KEY);--> statement-breakpoint
INSERT INTO new_parent SELECT id FROM parent;--> statement-breakpoint
DROP TABLE parent;--> statement-breakpoint
ALTER TABLE new_parent RENAME TO parent;--> statement-breakpoint
PRAGMA foreign_keys=ON;`,
    );

    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db, dir);

    expect(db.prepare('SELECT COUNT(*) AS count FROM child').get()).toEqual({ count: 1 });
  });

  it('restores foreign keys when a non-transactional migration fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tony-bad-migrations-'));
    writeFileSync(
      join(dir, '0000_bad.sql'),
      `PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE parent (id TEXT PRIMARY KEY);--> statement-breakpoint
BROKEN SQL;`,
    );

    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    expect(() => applyMigrations(db, dir)).toThrow();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
