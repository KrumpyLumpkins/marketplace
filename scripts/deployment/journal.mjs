import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { newState } from "./runner.mjs";
export function writeJson(path, value, { exclusive = false } = {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (exclusive && existsSync(path))
    throw new Error(`Refusing to overwrite ${path}`);
  const temporary = path + `.${process.pid}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    if (exclusive) {
      linkSync(temporary, path);
      unlinkSync(temporary);
    } else {
      renameSync(temporary, path);
    }
    const dir = openSync(dirname(path), "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}
export function fileJournal(path, plan) {
  return {
    read: async () =>
      existsSync(path)
        ? JSON.parse(readFileSync(path, "utf8"))
        : newState(plan),
    write: async (state) => writeJson(path, state),
  };
}
export async function withJournalLock(path, fn) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const lock = path + ".lock";
  let fd;
  try {
    fd = openSync(lock, "wx", 0o600);
  } catch {
    throw new Error(
      `Journal is locked: ${lock}. Confirm no process is running before removing a stale lock.`,
    );
  }
  try {
    writeFileSync(fd, String(process.pid));
    fsyncSync(fd);
    return await fn();
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
}
