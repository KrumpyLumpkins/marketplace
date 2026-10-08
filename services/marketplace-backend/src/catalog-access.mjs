import { Catalog } from "./catalog.mjs";
import { PgCatalog } from "./postgres/catalog.mjs";
export function createCatalog(store, config) {
  return store.dialect === "postgres"
    ? new PgCatalog(store, config)
    : new Catalog(store, config);
}
