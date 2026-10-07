import { readFileSync, writeFileSync } from "node:fs";
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
      classHash: hash.computeContractClassHash(contract),
      compiledClassHash: hash.computeCompiledClassHash(casm),
      sourceSha256: createHash("sha256")
        .update(readFileSync(new URL("src/lib.cairo", root)))
        .digest("hex"),
      productionDeployment: null,
    },
    null,
    2,
  ) + "\n",
);
