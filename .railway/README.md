# Railway environments

`railway.ts` defines this repository's complete service graph for **staging** and
**production**. Setup, variables, deployment and recovery instructions are in
[docs/RAILWAY.md](../docs/RAILWAY.md). `pnpm railway:check` validates both graphs
locally without contacting Railway. Do not store credentials or generated plans
here; use Railway shared variables and ignored `.context/railway/` respectively.
