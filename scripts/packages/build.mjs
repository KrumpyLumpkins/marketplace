import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
for (const name of ["marketplace-sdk", "marketplace-react"]) {
  const result = spawnSync(
    "pnpm",
    ["exec", "tsc", "-p", `packages/${name}/tsconfig.json`],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
mkdirSync("packages/marketplace-sdk/dist", { recursive: true });
copyFileSync(
  "contracts/marketplace/abi.json",
  "packages/marketplace-sdk/dist/abi.json",
);
copyFileSync(
  "contracts/marketplace/artifact-manifest.json",
  "packages/marketplace-sdk/dist/artifact-manifest.json",
);
