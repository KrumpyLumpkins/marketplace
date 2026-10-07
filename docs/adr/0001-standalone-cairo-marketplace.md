---
status: accepted
---

# Build a standalone Cairo marketplace with on-chain orders

On 6 October 2026 the user chose to replace the Arcade marketplace contracts while retaining the UI and building an owned Node.js indexer. The replacement will use direct Cairo contract storage and explicit trading events, with no Dojo World or Torii dependency; v1 uses on-chain orders for ERC-721 listings, token-specific offers and an atomic cart.

This replaces the earlier proposal to retain Arcade settlement. The trade-off is new contract validation and user approval/order migration in exchange for explicit economic guarantees, a smaller administration model and simpler indexing. The subsequent OpenSea-oriented [build plan](../BUILD-PLAN.md) adds one-shot collection offers to the launch target. Off-chain signed orders, ERC-1155 and partial fills remain deferred; the user subsequently confirmed inclusive buyer pricing, fixed token-order royalty snapshots, capped fill-time collection royalties and a non-upgradeable contract with limited administration. Actual production fee and administrator addresses remain required deployment inputs.
