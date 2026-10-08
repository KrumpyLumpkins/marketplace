import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { railwayApi, railwayTarget, PROJECT_ID } from "./api.mjs";
const environment = process.argv[2];
if (!["staging", "production"].includes(environment))
  throw new Error("Choose staging or production");
const target = railwayTarget(environment);
const existing = railwayApi(
  "query($p:String!,$e:String!){variables(projectId:$p,environmentId:$e)}",
  { p: PROJECT_ID, e: target.id },
).variables;
const values = {},
  ensure = (key, create) => {
    const value = existing[key] || create();
    if (!existing[key]) values[key] = value;
    return value;
  };
const admin = ensure("POSTGRES_ADMIN_PASSWORD", () =>
  randomBytes(32).toString("hex"),
);
const roles = {};
for (const role of ["api", "index", "metadata"]) {
  const name = "market_" + role;
  const url = ensure(
    `POSTGRES_${role.toUpperCase()}_DATABASE_URL`,
    () =>
      `postgresql://${name}:${randomBytes(32).toString("hex")}@postgres.railway.internal:5432/marketplace`,
  );
  const parsed = new URL(url);
  if (
    parsed.hostname !== "postgres.railway.internal" ||
    parsed.username !== name ||
    !/^[a-f0-9]{64}$/.test(parsed.password)
  )
    throw new Error("Review existing PostgreSQL role URL before updating");
  roles[role] = { name, password: parsed.password };
}
ensure("MARKETPLACE_STORE", () => "sqlite");
ensure("MARKETPLACE_MAINTENANCE", () => "false");
ensure("POSTGRES_BACKGROUND_ENABLED", () => "false");
ensure("MARKETPLACE_FAST_HISTORY_ENABLED", () => "false");
if (
  Object.keys(values).length &&
  !railwayApi(
    "mutation($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}",
    {
      input: {
        projectId: PROJECT_ID,
        environmentId: target.id,
        variables: values,
        replace: false,
        skipDeploys: true,
      },
    },
  ).variableCollectionUpsert
)
  throw new Error("Railway variable update failed");
const dir = ".context/postgres";
mkdirSync(dir, { recursive: true });
const path = `${dir}/${environment}-credentials.json`;
writeFileSync(
  path,
  JSON.stringify(
    {
      databaseUrl: `postgresql://postgres:${admin}@postgres.railway.internal:5432/marketplace`,
      roles,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
chmodSync(path, 0o600);
console.log(
  JSON.stringify({
    environment,
    createdVariables: Object.keys(values),
    credentialsFile: path,
    notice:
      "Passwords are not printed. The existing store selection and worker state were preserved.",
  }),
);
