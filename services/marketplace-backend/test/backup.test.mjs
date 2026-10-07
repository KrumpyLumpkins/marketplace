import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.mjs";
test("backup restores chain state and independent reports/read state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "biblio-restore-"));
  const source = new Store(join(dir, "source.sqlite"));
  let restored;
  try {
    source.applyBlock({
      number: 1,
      hash: "0x1",
      parentHash: "0x0",
      timestamp: 1,
      events: [],
    });
    source.app
      .prepare("INSERT INTO reports(id,account,body,created) VALUES(?,?,?,?)")
      .run("report", "0x1", '{"reason":"test report"}', 1);
    await source.backup(join(dir, "backup.sqlite"));
    restored = new Store(join(dir, "backup.sqlite"));
    assert.equal(restored.head().hash, "0x1");
    assert.equal(
      restored.app.prepare("SELECT COUNT(*) AS n FROM reports").get().n,
      1,
    );
    restored.rewind(-1);
    assert.equal(
      restored.app.prepare("SELECT COUNT(*) AS n FROM reports").get().n,
      1,
    );
  } finally {
    source.close();
    restored?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
