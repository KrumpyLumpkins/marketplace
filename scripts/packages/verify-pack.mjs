import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const root = process.cwd(),
  temp = mkdtempSync(join(tmpdir(), "biblio-sdk-consumer-"));
function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${cmd} failed: ${result.status}`);
}
try {
  run("pnpm", ["sdk:build"]);
  for (const [folder, name] of [
    ["marketplace-sdk", "marketplace"],
    ["marketplace-react", "marketplace-react"],
  ]) {
    run(
      "pnpm",
      ["pack", "--pack-destination", temp],
      join(root, "packages", folder),
    );
    const archive = readdirSync(temp).find(
      (f) => f === `biblio-${name}-0.1.0.tgz`,
    );
    assert.ok(archive);
    const dest = join(temp, "node_modules", "@biblio", name);
    mkdirSync(dest, { recursive: true });
    run("tar", [
      "-xzf",
      join(temp, archive),
      "--strip-components=1",
      "-C",
      dest,
    ]);
    const manifest = JSON.parse(readFileSync(join(dest, "package.json")));
    assert.ok(manifest.exports["."].types);
    assert.ok(!JSON.stringify(manifest).includes("workspace:"));
  }
  const links = {
    react: "node_modules/react",
    "react-dom": "node_modules/react-dom",
    "@tanstack/react-query": "node_modules/@tanstack/react-query",
    "@tanstack/query-core":
      "packages/marketplace-sdk/node_modules/@tanstack/query-core",
    "@types/react": "node_modules/@types/react",
    "@types/node": "node_modules/@types/node",
  };
  for (const [name, source] of Object.entries(links)) {
    const dest = join(temp, "node_modules", name);
    mkdirSync(resolve(dest, ".."), { recursive: true });
    symlinkSync(realpathSync(join(root, source)), dest, "dir");
  }
  writeFileSync(
    join(temp, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  writeFileSync(
    join(temp, "consumer.mjs"),
    `
import assert from 'node:assert/strict';import React from 'react';import {renderToString} from 'react-dom/server';
import {createMarketplaceClient} from '@biblio/marketplace';import {MarketplaceProvider,useMarketplaceQuery} from '@biblio/marketplace-react';
const client=createMarketplaceClient({apiUrl:'https://fixture.example',chain:'LOCAL',chainId:'0x1',fetch:async()=>new Response(JSON.stringify({data:{name:'Packed package consumer'}}))});
assert.equal((await client.collections.get('0xa')).name,'Packed package consumer');
function View(){return React.createElement('p',null,useMarketplaceQuery('/collections/0xa').data?.name);}
assert.match(renderToString(React.createElement(MarketplaceProvider,{client},React.createElement(View))),/Packed package consumer/);client.dispose();
console.log('Packed ESM Node + React consumers passed, without repository source imports.');
`,
  );
  writeFileSync(
    join(temp, "consumer.ts"),
    `import {createMarketplaceClient,type ApiCollection,type PreparedTrade} from '@biblio/marketplace';import {useMarketplaceQuery} from '@biblio/marketplace-react';const client=createMarketplaceClient({apiUrl:'https://example.com',chain:'SN_MAIN',chainId:'0x1'});const query=()=>useMarketplaceQuery<ApiCollection[]>('/collections');const prepare=(account:string)=>client.trades.prepareCancel(account,[]) satisfies Promise<PreparedTrade>;void query;void prepare;`,
  );
  run(process.execPath, ["consumer.mjs"], temp);
  run(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "consumer.ts",
    ],
    temp,
  );
  assert.ok(
    JSON.parse(
      readFileSync(
        join(temp, "node_modules/@biblio/marketplace/dist/abi.json"),
      ),
    ).length,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
