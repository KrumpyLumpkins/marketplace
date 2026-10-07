import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
test("backend runtime imports only local files and Node built-ins", () => {
  const directory = new URL("../src/", import.meta.url);
  for (const name of readdirSync(directory).filter((n) => n.endsWith(".mjs"))) {
    const text = readFileSync(new URL(name, directory), "utf8");
    for (const match of text.matchAll(
      /(?:\bfrom\s+|import\s*\()(["'])([^"']+)\1/g,
    ))
      assert.ok(
        match[2].startsWith("./") || match[2].startsWith("node:"),
        `${name}: ${match[2]}`,
      );
  }
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url)),
  );
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
});
