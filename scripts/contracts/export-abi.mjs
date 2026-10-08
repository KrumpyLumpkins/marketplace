import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hash } from "starknet-devnet-sdk";
const root = new URL("../../contracts/marketplace/", import.meta.url);
const contract = JSON.parse(
  readFileSync(
    new URL(
      "target/dev/biblio_marketplace_Marketplace.contract_class.json",
      root,
    ),
  ),
);
const casm = JSON.parse(
  readFileSync(
    new URL(
      "target/dev/biblio_marketplace_Marketplace.compiled_contract_class.json",
      root,
    ),
  ),
);
const manifestPath = new URL("artifact-manifest.json", root);
const previous = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : null;
const classHash = hash.computeContractClassHash(contract);
writeFileSync(
  new URL("abi.json", root),
  JSON.stringify(contract.abi, null, 2) + "\n",
);
writeFileSync(
  new URL("artifact-manifest.json", root),
  JSON.stringify(
    {
      name: "Marketplace",
      version: 1,
      scarb: "2.15.1",
      classHash,
      compiledClassHash: hash.computeCompiledClassHash(casm),
      sourceSha256: createHash("sha256")
        .update(readFileSync(new URL("src/lib.cairo", root)))
        .digest("hex"),
      // Regenerating the same artifact must not erase its deployment record.
      productionDeployment: previous?.classHash === classHash
        ? (previous.productionDeployment ?? null)
        : null,
    },
    null,
    2,
  ) + "\n",
);
