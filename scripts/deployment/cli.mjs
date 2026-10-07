import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Account, RpcProvider } from "starknet-devnet-sdk";
import { RpcClient } from "../../services/marketplace-backend/src/rpc.mjs";
import {
  address,
  buildPlan,
  CHAINS,
  checkPlan,
  digest,
  loadArtifacts,
  mainnetBlockers,
  requireValue,
  same,
  STEPS,
} from "./plan.mjs";
import {
  assertIdentity,
  checkState,
  confirmStep,
  handoff,
  resetReverted,
  sendStep,
  verifyLive,
} from "./runner.mjs";
import { fileJournal, withJournalLock, writeJson } from "./journal.mjs";
const root = new URL("../../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const commit = () =>
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
const dirty = () =>
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim().length > 0;
function args(argv) {
  const [command, ...rest] = argv;
  const allowed = {
    plan: ["config", "out"],
    probe: ["config", "out"],
    inspect: ["plan", "journal"],
    calls: ["plan", "step", "out", "activation-evidence"],
    send: ["plan", "step", "approve", "journal", "activation-evidence"],
    confirm: ["plan", "step", "hash", "journal", "activation-evidence"],
    "reset-reverted": ["plan", "step", "journal"],
    verify: ["plan", "journal"],
    export: ["plan", "out-dir", "journal"],
    help: [],
  };
  requireValue(!command || command in allowed, "Unknown command");
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    requireValue(
      rest[i].startsWith("--") && rest[i + 1] && !rest[i + 1].startsWith("--"),
      "Use --option value",
    );
    const key = rest[i].slice(2);
    requireValue(
      allowed[command].includes(key) && !(key in options),
      `Unknown/duplicate option ${key}`,
    );
    options[key] = rest[i + 1];
  }
  return { command, options };
}
function connect(network) {
  const url = process.env.DEPLOYMENT_RPC_URL;
  requireValue(url, "DEPLOYMENT_RPC_URL is required");
  const parsed = new URL(url);
  requireValue(
    parsed.protocol === "https:" ||
      (network === "SN_SEPOLIA" &&
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)),
    "Use HTTPS RPC, except localhost Sepolia/devnet rehearsals",
  );
  return { url, rpc: new RpcClient([url], { retries: 0 }) };
}
async function makeSigner(plan, step, provider, artifacts) {
  const expected = plan.steps[step].sender;
  let account;
  if (process.env.DEPLOYMENT_SIGNER_MODULE) {
    const adapter = await import(
      pathToFileURL(resolve(process.env.DEPLOYMENT_SIGNER_MODULE)).href
    );
    account = await adapter.createAccount({
      provider,
      address: expected,
      chainId: plan.chainId,
    });
  } else if (process.env.DEPLOYMENT_SIGNER_PRIVATE_KEY) {
    requireValue(
      process.env.DEPLOYMENT_SIGNER_ADDRESS &&
        same(process.env.DEPLOYMENT_SIGNER_ADDRESS, expected),
      "Set DEPLOYMENT_SIGNER_ADDRESS to the planned sender",
    );
    account = new Account({
      provider,
      address: expected,
      signer: process.env.DEPLOYMENT_SIGNER_PRIVATE_KEY,
    });
  } else return undefined;
  requireValue(
    account.address && same(account.address, expected),
    "Signer adapter returned a different account",
  );
  return {
    address: account.address,
    estimate: async (s, p, nonce) =>
      (s === "declare"
        ? await account.estimateDeclareFee(
            { contract: artifacts.contract, casm: artifacts.casm },
            { nonce, tip: 0n },
          )
        : await account.estimateInvokeFee(p.steps[s].calls, { nonce, tip: 0n })
      ).resourceBounds,
    send: async (s, p, details) =>
      s === "declare"
        ? account.declare(
            { contract: artifacts.contract, casm: artifacts.casm },
            details,
          )
        : account.execute(p.steps[s].calls, details),
  };
}
export async function main(argv = process.argv.slice(2)) {
  const { command, options: o } = args(argv);
  if (!command || command === "help") {
    console.log(
      "probe --config FILE --out FILE (read-only identity observations)\nplan --config FILE --out FILE\ninspect --plan FILE\ncalls --plan FILE --step deploy|configure|activate --out FILE\nsend --plan FILE --step STEP --approve DIGEST [--activation-evidence FILE]\nconfirm --plan FILE --step STEP [--hash HASH]\nreset-reverted --plan FILE --step STEP\nverify --plan FILE\nexport --plan FILE --out-dir DIRECTORY\nNetwork commands require DEPLOYMENT_RPC_URL. Writes additionally require a signer.",
    );
    return;
  }
  if (command === "probe") {
    requireValue(o.config && o.out, "probe needs --config and --out");
    const config = readJson(o.config);
    requireValue(
      typeof config.network === "string" &&
        Object.hasOwn(CHAINS, config.network),
      "Unknown network",
    );
    const { rpc } = connect(config.network);
    requireValue(
      same(await rpc.call("starknet_chainId", []), CHAINS[config.network]),
      "Wrong Starknet network",
    );
    const head = await rpc.call("starknet_getBlockWithTxHashes", {
      block_id: "latest",
    });
    requireValue(head.block_hash, "Accepted head required");
    const identify = async (at) => ({
      address: address(at),
      classHash: await rpc.call("starknet_getClassHashAt", {
        contract_address: address(at),
        block_id: { block_hash: head.block_hash },
      }),
    });
    const identities = {};
    for (const [role, at] of [
      ["udc", config.udc?.address],
      ["deployer", config.deployer],
      ["administrator", config.administrator],
    ])
      if (at) identities[role] = await identify(at);
    for (const type of ["collections", "currencies"]) {
      identities[type] = [];
      for (const asset of config[type] ?? [])
        identities[type].push(await identify(asset.address));
    }
    writeJson(
      resolve(o.out),
      {
        network: config.network,
        observedBlock: head.block_number,
        observedBlockHash: head.block_hash,
        identities,
        notice:
          "RPC observations only: review independently before copying hashes into a plan.",
      },
      { exclusive: true },
    );
    return;
  }
  if (command === "plan") {
    requireValue(o.config && o.out, "plan needs --config and --out");
    execFileSync("scarb", ["build"], {
      cwd: new URL("contracts/marketplace/", root),
      stdio: "inherit",
    });
    const artifacts = loadArtifacts(root);
    const plan = buildPlan(readJson(o.config), artifacts.identity, commit());
    writeJson(resolve(o.out), plan, { exclusive: true });
    console.log(
      JSON.stringify(
        {
          planId: plan.planId,
          address: plan.address,
          administrator: plan.config.administrator,
          mainnetBlockers: mainnetBlockers(plan, "activate"),
          dirtyWorkingTree: dirty(),
        },
        null,
        2,
      ),
    );
    return;
  }
  requireValue(o.plan, "--plan is required");
  const plan = checkPlan(readJson(o.plan));
  if (command === "calls") {
    requireValue(
      o.out && ["deploy", "configure", "activate"].includes(o.step),
      "calls needs --step deploy|configure|activate and --out",
    );
    writeJson(
      resolve(o.out),
      {
        planId: plan.planId,
        network: plan.config.network,
        sender: plan.steps[o.step].sender,
        maximumFeeFri: plan.config.maxFeeFri,
        releaseBlockers: mainnetBlockers(
          plan,
          o.step,
          o["activation-evidence"]
            ? readJson(o["activation-evidence"])
            : undefined,
        ),
        calls: plan.steps[o.step].calls,
      },
      { exclusive: true },
    );
    return;
  }
  requireValue(
    [
      "inspect",
      "send",
      "confirm",
      "reset-reverted",
      "verify",
      "export",
    ].includes(command),
    "Unknown command",
  );
  const { url, rpc } = connect(plan.config.network);
  const journalPath = resolve(
    o.journal ?? resolve(dirname(o.plan), "state.json"),
  );
  const journal = fileJournal(journalPath, plan);
  const output = await withJournalLock(journalPath, async () => {
    if (command === "inspect") {
      await assertIdentity(rpc, plan);
      return {
        planId: plan.planId,
        address: plan.address,
        blockers: mainnetBlockers(plan, "activate"),
        state: await journal.read(),
      };
    }
    if (["send", "confirm", "reset-reverted"].includes(command))
      requireValue(
        STEPS.includes(o.step),
        "Choose declare, deploy, configure or activate",
      );
    if (command === "send") {
      const artifacts = loadArtifacts(root);
      requireValue(
        digest(artifacts.identity) === digest(plan.artifacts),
        "Artifacts differ from plan",
      );
      if (plan.config.network === "SN_MAIN")
        requireValue(
          commit() === plan.gitCommit,
          "Mainnet checkout commit differs from plan",
        );
      const signer = await makeSigner(
        plan,
        o.step,
        new RpcProvider({ nodeUrl: url, retries: 0 }),
        artifacts,
      );
      return sendStep({
        plan,
        step: o.step,
        rpc,
        journal,
        signer,
        approve: o.approve,
        clean: !dirty(),
        activation: o["activation-evidence"]
          ? readJson(o["activation-evidence"])
          : undefined,
      });
    }
    if (command === "confirm")
      return confirmStep({
        plan,
        step: o.step,
        rpc,
        journal,
        hash: o.hash,
        activation: o["activation-evidence"]
          ? readJson(o["activation-evidence"])
          : undefined,
      });
    if (command === "reset-reverted")
      return resetReverted({ plan, step: o.step, rpc, journal });
    const state = checkState(plan, await journal.read());
    const verified = await verifyLive(rpc, plan, state);
    if (command === "verify") return verified;
    requireValue(o["out-dir"], "export needs --out-dir");
    const dir = resolve(o["out-dir"]);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const result = handoff(plan, state, verified);
    writeJson(resolve(dir, "registry.json"), result.registry, {
      exclusive: true,
    });
    writeJson(resolve(dir, "deployment.json"), result.record, {
      exclusive: true,
    });
    for (const [name, text] of [
      [".env.frontend.example", result.frontend],
      [".env.backend.example", result.backend],
    ])
      writeFileSync(resolve(dir, name), text, { flag: "wx", mode: 0o600 });
    return { outputDirectory: dir, ...verified };
  });
  if (output) console.log(JSON.stringify(output, null, 2));
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    let message = String(error.message ?? "Deployment failed");
    for (const secret of [
      process.env.DEPLOYMENT_RPC_URL,
      process.env.DEPLOYMENT_SIGNER_PRIVATE_KEY,
    ].filter(Boolean))
      message = message.split(secret).join("[redacted]");
    console.error(message);
    process.exitCode = 1;
  });
