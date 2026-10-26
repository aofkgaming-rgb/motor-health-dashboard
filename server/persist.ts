/**
 * Small file-based persistence in DATA_DIR (default ./data).
 *
 * Locally and on a server with a persistent disk, everything here survives restarts.
 * On the Render FREE plan the disk is wiped on every redeploy or restart, so the admin
 * should download a backup (Administration → System) after changing settings.
 */
import fs from 'fs';
import path from 'path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

export function dataPath(...p: string[]) {
  return path.join(DATA_DIR, ...p);
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(dataPath(file), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Atomic write (temp file + rename), so a crash never leaves half a file. */
export function writeJsonNow(file: string, data: unknown) {
  const full = dataPath(file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, full);
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();
/** Write at most once per `ms` per file. */
export function writeJsonSoon(file: string, get: () => unknown, ms = 2000) {
  if (pending.has(file)) return;
  pending.set(
    file,
    setTimeout(() => {
      pending.delete(file);
      try {
        writeJsonNow(file, get());
      } catch (e) {
        console.error(`Could not save ${file}:`, (e as Error).message);
      }
    }, ms),
  );
}

export function appendLine(file: string, line: string) {
  const full = dataPath(file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.appendFileSync(full, line + '\n');
}

export function dirSizeBytes(dir: string): number {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      n += e.isDirectory() ? dirSizeBytes(p) : fs.statSync(p).size;
    }
  } catch {}
  return n;
}
