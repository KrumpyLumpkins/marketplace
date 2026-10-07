import { ApiError, uint } from "./domain.mjs";
export class RpcClient {
  constructor(
    urls,
    {
      fetch: fetchImpl = fetch,
      timeoutMs = 15000,
      retries = 1,
      maxBytes = 16 * 1024 * 1024,
    } = {},
  ) {
    if (!urls.length || urls.some((u) => !/^https?:\/\//.test(u)))
      throw new Error("At least one RPC URL is required.");
    this.urls = urls;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.maxBytes = maxBytes;
    this.sequence = 0;
  }
  async call(method, params, { endpoint } = {}) {
    const id = ++this.sequence;
    let error;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const url = endpoint ?? this.urls[attempt % this.urls.length];
        const response = await this.fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
        const reader = response.body.getReader();
        let size = 0;
        const chunks = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > this.maxBytes)
              throw new Error("RPC response exceeds limit");
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (data.id !== id || data.jsonrpc !== "2.0")
          throw new Error("Invalid RPC response identity");
        if (data.error)
          throw new ApiError(
            "RPC_CONTRACT_ERROR",
            data.error.message ?? "RPC call failed",
            502,
            { rpcCode: data.error.code, data: data.error.data },
          );
        if (!Object.hasOwn(data, "result"))
          throw new Error("Missing RPC result");
        return data.result;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        error = e;
        if (attempt < this.retries)
          await new Promise((r) =>
            setTimeout(r, Math.min(100 * 2 ** attempt, 1000)),
          );
      }
    }
    throw new ApiError(
      "RPC_UNAVAILABLE",
      `RPC request failed: ${error?.message ?? "unavailable"}`,
      503,
    );
  }
  contract(
    contract_address,
    entry_point_selector,
    calldata = [],
    block_id = "latest",
  ) {
    return this.call("starknet_call", {
      request: {
        contract_address,
        entry_point_selector,
        calldata: calldata.map((value) => {
          const n = BigInt(uint(value, 252));
          if (n >= (1n << 251n) + 17n * (1n << 192n) + 1n)
            throw new ApiError(
              "INVALID_FELT",
              "Calldata exceeds the Starknet field.",
            );
          return "0x" + n.toString(16);
        }),
      },
      block_id,
    });
  }
}
