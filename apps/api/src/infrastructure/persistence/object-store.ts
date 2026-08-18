import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getObjectStoreOverride } from "../runtime-overrides.js";
import { loadConfig } from "../config.js";

export interface ObjectStore {
  get(key: string): Promise<Buffer | null>;
  put(key: string, body: Buffer | string, contentType?: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  delete?(key: string): Promise<void>;
}

export class MemoryObjectStore implements ObjectStore {
  private readonly files = new Map<string, Buffer>();

  async get(key: string): Promise<Buffer | null> {
    return this.files.get(normalizeKey(key)) ?? null;
  }

  async put(key: string, body: Buffer | string): Promise<void> {
    this.files.set(
      normalizeKey(key),
      typeof body === "string" ? Buffer.from(body, "utf8") : body,
    );
  }

  async list(prefix: string): Promise<string[]> {
    const p = normalizeKey(prefix);
    return [...this.files.keys()].filter((k) => k.startsWith(p));
  }

  async delete(key: string): Promise<void> {
    this.files.delete(normalizeKey(key));
  }
}

export class FilesystemObjectStore implements ObjectStore {
  constructor(private readonly rootDir: string) {}

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.filePath(key));
    } catch {
      return null;
    }
  }

  async put(key: string, body: Buffer | string): Promise<void> {
    const file = this.filePath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async list(prefix: string): Promise<string[]> {
    const dir = path.join(this.rootDir, normalizeKey(prefix));
    const out: string[] = [];
    await walk(dir, this.rootDir, out);
    return out.filter((k) => k.startsWith(normalizeKey(prefix)));
  }

  async delete(key: string): Promise<void> {
    const { unlink } = await import("node:fs/promises");
    await unlink(this.filePath(key)).catch(() => undefined);
  }

  private filePath(key: string): string {
    return path.join(this.rootDir, normalizeKey(key));
  }
}

export class VercelBlobObjectStore implements ObjectStore {
  constructor(private readonly token: string) {}

  private blobAuth(): { token: string } {
    return { token: this.token };
  }

  async get(key: string): Promise<Buffer | null> {
    const { get } = await import("@vercel/blob");
    try {
      const result = await get(normalizeKey(key), {
        access: "private",
        ...this.blobAuth(),
        useCache: false,
      });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const bytes = await new Response(result.stream).arrayBuffer();
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  }

  async put(
    key: string,
    body: Buffer | string,
    contentType?: string,
  ): Promise<void> {
    const { put } = await import("@vercel/blob");
    await put(normalizeKey(key), body, {
      access: "private",
      ...this.blobAuth(),
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
  }

  async list(prefix: string): Promise<string[]> {
    const { list } = await import("@vercel/blob");
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({
        prefix: normalizeKey(prefix),
        ...this.blobAuth(),
        cursor,
      });
      for (const blob of page.blobs) {
        keys.push(blob.pathname);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return keys;
  }

  async delete(key: string): Promise<void> {
    const { del } = await import("@vercel/blob");
    await del(normalizeKey(key), this.blobAuth()).catch(() => undefined);
  }
}

export function hostedPersistenceConfigured(): boolean {
  if (getObjectStoreOverride()) return true;
  return Boolean(loadConfig().persistence.blobToken);
}

export function getObjectStore(): ObjectStore | undefined {
  const override = getObjectStoreOverride();
  if (override) return override;
  const token = loadConfig().persistence.blobToken;
  if (!token) return undefined;
  return new VercelBlobObjectStore(token);
}

export async function probeObjectStore(): Promise<boolean> {
  const store = getObjectStore();
  if (!store) return false;
  try {
    await store.list("hosted/");
    return true;
  } catch {
    return false;
  }
}

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, "").replace(/\\/g, "/");
}

async function walk(
  dir: string,
  root: string,
  out: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, root, out);
    } else {
      out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
}
