import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
test("backend runtime imports only local files, Node built-ins and the approved PostgreSQL driver", () => {
  const directory = new URL("../src/", import.meta.url);
  for (const name of readdirSync(directory, { recursive: true }).filter((n) =>
    n.endsWith(".mjs"),
  )) {
    const source = readFileSync(new URL(name, directory), "utf8");
    for (const match of source.matchAll(
      /(?:\bfrom\s+|import\s*\()(["'])([^"']+)\1/g,
    ))
      assert.ok(
        match[2].startsWith("./") ||
          match[2].startsWith("../") ||
          match[2].startsWith("node:") ||
          match[2] === "pg",
        `${name}: ${match[2]}`,
      );
  }
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url)),
  );
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ["pg"]);
  assert.match(
    pkg.dependencies.pg,
    /^\d+\.\d+\.\d+$/,
    "Database driver version must be pinned",
  );
});
