import { runtime } from "./runtime.mjs";
import { resolve } from "node:path";
const path = process.argv[2];
if (!path) throw new Error("Usage: node src/backup.mjs <destination.sqlite>");
const { store } = await runtime();
try {
  if (store.dialect === "postgres") throw new Error("Use PostgreSQL 18 pg_dump and the restore verification procedure in docs/POSTGRES-OPERATIONS.md.");
  await store.backup(resolve(path));
  console.log("Chain and application databases backed up.");
} finally {
  await store.close();
}
