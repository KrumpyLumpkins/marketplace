import { mapConcurrent } from "./concurrency.mjs";
/** Read every proof value at one block, in bounded RPC batches without sampling. */
export async function readHistoryContracts(rpc, calls, blockId) {
  if (!rpc.batch)
    return mapConcurrent(calls, 4, ([at, selector, data]) =>
      rpc.contract(at, selector, data, blockId),
    );
  const batches = [];
  for (let i = 0; i < calls.length; i += 32)
    batches.push(
      calls
        .slice(i, i + 32)
        .map(([at, selector, data]) => ({
          method: "starknet_call",
          params: {
            block_id: blockId,
            request: {
              contract_address: at,
              entry_point_selector: selector,
              calldata: data.map((v) => "0x" + BigInt(v).toString(16)),
            },
          },
        })),
    );
  return (await mapConcurrent(batches, 2, (b) => rpc.batch(b))).flat();
}
