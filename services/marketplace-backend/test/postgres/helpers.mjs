import pg from "pg";
import { randomUUID } from "node:crypto";
const url = process.env.PG_TEST_DATABASE_URL;
export async function testDatabase(t) {
  if (!url)
    throw new Error(
      "PG_TEST_DATABASE_URL is required for PostgreSQL integration tests.",
    );
  const admin = new pg.Pool({ connectionString: url, max: 2 });
  const name = "market_test_" + randomUUID().replaceAll("-", "");
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    await admin.end();
    throw error;
  }
  const database = new URL(url);
  database.pathname = "/" + name;
  const pools = [];
  t.after(async () => {
    for (const pool of pools) await pool.end();
    for (let n = 0; n < 100; n++) {
      if (
        !(
          await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1", [
            name,
          ])
        ).rowCount
      )
        break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });
  return {
    url: database.href,
    pool: () => {
      const pool = new pg.Pool({ connectionString: database.href, max: 4 });
      pools.push(pool);
      return pool;
    },
  };
}
