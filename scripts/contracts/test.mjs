import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
const local = new URL(
  "../../.context/toolchain/starknet-foundry-v0.64.1-aarch64-apple-darwin/bin/snforge",
  import.meta.url,
);
const binary =
  process.env.SNFORGE_BIN ??
  (existsSync(local) ? fileURLToPath(local) : "snforge");
const version = spawnSync(binary, ["--version"], { encoding: "utf8" });
if (version.status !== 0 || version.stdout?.trim() !== "snforge 0.64.1")
  throw new Error(
    "Install snforge 0.64.1 or set SNFORGE_BIN to that version. The runner and snforge_std must match.",
  );
const result = spawnSync(
  binary,
  ["test", "--features", "fixtures", ...process.argv.slice(2)],
  {
    cwd: new URL("../../contracts/marketplace/", import.meta.url),
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
