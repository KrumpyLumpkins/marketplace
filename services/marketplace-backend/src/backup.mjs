import { runtime } from "./runtime.mjs";
import { resolve } from "node:path";
const path = process.argv[2];
if (!path) throw new Error("Usage: node src/backup.mjs <destination.sqlite>");
const { store } = runtime();
try {
  await store.backup(resolve(path));
  console.log("Chain and application databases backed up.");
} finally {
  store.close();
}
