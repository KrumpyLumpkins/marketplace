import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { writeJson, withJournalLock } from "./journal.mjs";
it("never overwrites a frozen plan and excludes concurrent journal mutation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "market-deployment-"));
  const path = join(dir, "state.json");
  try {
    writeJson(path, { value: 1 }, { exclusive: true });
    expect(() => writeJson(path, { value: 2 }, { exclusive: true })).toThrow(
      "overwrite",
    );
    expect(JSON.parse(readFileSync(path))).toEqual({ value: 1 });
    await withJournalLock(path, async () => {
      await expect(withJournalLock(path, async () => {})).rejects.toThrow(
        "locked",
      );
    });
    await withJournalLock(path, async () => writeJson(path, { value: 3 }));
    expect(JSON.parse(readFileSync(path))).toEqual({ value: 3 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
