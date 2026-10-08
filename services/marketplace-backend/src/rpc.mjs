import { ApiError, uint } from "./domain.mjs";
export class RpcClient {
  constructor(
    urls,
    {
      fetch: fetchImpl = fetch,
      timeoutMs = 15000,
      retries = 1,
      maxBytes = 16 * 1024 * 1024,
      rateLimitRetries = 6,
      sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now = Date.now,
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
    this.rateLimitRetries = rateLimitRetries;
    this.sleep = sleep;
    this.now = now;
    this.cooldownUntil = 0;
    this.rateLimits = 0;
  }
  async call(method, params, { endpoint } = {}) {
    const id = ++this.sequence;
    let error,
      attempt = 0,
      throttles = 0;
    while (true) {
      try {
        const data = await this.request(
          endpoint ?? this.urls[attempt % this.urls.length],
          { jsonrpc: "2.0", id, method, params },
        );
        if (data.id !== id || data.jsonrpc !== "2.0")
          throw new Error("Invalid RPC response identity");
        if (data.error?.code === 429) {
          this.rateLimits++;
          throw Object.assign(new Error("RPC rate limited"), {
            code: "RPC_RATE_LIMITED",
          });
        }
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
        if (e.code === "RPC_RATE_LIMITED" && !(e instanceof ApiError)) {
          if (throttles >= this.rateLimitRetries)
            throw new ApiError(
              "RPC_RATE_LIMITED",
              "RPC rate limit retry budget exhausted",
              503,
            );
          this.pauseForRateLimit(throttles++, e.retryAfter);
          continue;
        }
        if (e instanceof ApiError) throw e;
        error = e;
        if (attempt >= this.retries) break;
        await this.sleep(Math.min(100 * 2 ** attempt++, 1000));
      }
    }
    throw new ApiError(
      "RPC_UNAVAILABLE",
      `RPC request failed: ${error?.message ?? "unavailable"}`,
      503,
    );
  }
  pauseForRateLimit(attempt, retryAfter = 0) {
    this.cooldownUntil = Math.max(
      this.cooldownUntil,
      this.now() +
        Math.min(
          30000,
          Math.max(retryAfter, Math.min(500 * 2 ** attempt, 8000)),
        ),
    );
  }
  async request(url, payload) {
    while (this.cooldownUntil > this.now())
      await this.sleep(this.cooldownUntil - this.now());
    const response = await this.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const error = new Error(`RPC HTTP ${response.status}`);
      if (response.status === 413) error.code = "RPC_RESPONSE_LIMIT";
      if (response.status === 429) {
        error.code = "RPC_RATE_LIMITED";
        const header = response.headers.get("retry-after"),
          seconds = Number(header);
        error.retryAfter = header
          ? Number.isFinite(seconds)
            ? Math.max(0, seconds * 1000)
            : Math.max(0, Date.parse(header) - this.now()) || 0
          : 0;
        this.rateLimits++;
        this.pauseForRateLimit(0, error.retryAfter);
      }
      throw error;
    }
    const reader = response.body.getReader(),
      chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > this.maxBytes) {
          const error = new Error("RPC response exceeds limit");
          error.code = "RPC_RESPONSE_LIMIT";
          throw error;
        }
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  /** Read-only JSON-RPC batches. Returned order always matches the request order. */
  async batch(calls, { endpoint } = {}) {
    if (
      !Array.isArray(calls) ||
      !calls.length ||
      calls.length > 64 ||
      calls.some(
        (c) =>
          !/^starknet_(get|chainId|blockNumber|specVersion|call)/.test(
            c.method,
          ),
      )
    )
      throw new Error("RPC batch requires 1–64 read calls");
    const payload = calls.map((c) => ({
      jsonrpc: "2.0",
      id: ++this.sequence,
      method: c.method,
      params: c.params,
    }));
    let pending = payload,
      transportAttempts = 0,
      throttles = 0;
    const results = new Map();
    while (true) {
      try {
        const data = await this.request(
          endpoint ?? this.urls[transportAttempts % this.urls.length],
          pending,
        );
        if (
          !Array.isArray(data) &&
          [-32600, -32601].includes(data?.error?.code)
        ) {
          for (const call of pending)
            results.set(
              call.id,
              await this.call(call.method, call.params, { endpoint }),
            );
          return payload.map((x) => results.get(x.id));
        }
        if (!Array.isArray(data) || data.length !== pending.length)
          throw new ApiError(
            "RPC_BATCH_IDENTITY",
            "Invalid RPC batch response identity",
            502,
          );
        const expected = new Set(pending.map((x) => x.id)),
          seen = new Set(),
          limited = new Set();
        for (const row of data) {
          if (
            row.jsonrpc !== "2.0" ||
            !expected.has(row.id) ||
            seen.has(row.id)
          )
            throw new ApiError(
              "RPC_BATCH_IDENTITY",
              "Invalid or duplicate RPC response identity",
              502,
            );
          seen.add(row.id);
          if (row.error?.code === 429) {
            limited.add(row.id);
            continue;
          }
          if (row.error)
            throw new ApiError(
              "RPC_CONTRACT_ERROR",
              row.error.message ?? "RPC call failed",
              502,
              { rpcCode: row.error.code },
            );
          if (!Object.hasOwn(row, "result"))
            throw new ApiError(
              "RPC_BATCH_IDENTITY",
              "Missing RPC batch result",
              502,
            );
          results.set(row.id, row.result);
        }
        if (!limited.size) return payload.map((x) => results.get(x.id));
        this.rateLimits++;
        if (throttles >= this.rateLimitRetries)
          throw new ApiError(
            "RPC_RATE_LIMITED",
            "RPC batch rate limit retry budget exhausted",
            503,
          );
        pending = pending.filter((x) => limited.has(x.id));
        this.pauseForRateLimit(throttles++);
      } catch (error) {
        if (error.code === "RPC_RESPONSE_LIMIT" && pending.length > 1) {
          const split = Math.ceil(pending.length / 2),
            remaining = [];
          for (const part of [pending.slice(0, split), pending.slice(split)])
            remaining.push(
              ...(await this.batch(
                part.map(({ method, params }) => ({ method, params })),
                { endpoint },
              )),
            );
          pending.forEach((call, i) => results.set(call.id, remaining[i]));
          return payload.map((x) => results.get(x.id));
        }
        if (error.code === "RPC_RATE_LIMITED" && !(error instanceof ApiError)) {
          if (throttles >= this.rateLimitRetries)
            throw new ApiError(
              "RPC_RATE_LIMITED",
              "RPC batch rate limit retry budget exhausted",
              503,
            );
          this.pauseForRateLimit(throttles++, error.retryAfter);
          continue;
        }
        if (error instanceof ApiError) throw error;
        if (transportAttempts >= this.retries)
          throw new ApiError(
            "RPC_UNAVAILABLE",
            `RPC batch failed: ${error?.message ?? "unavailable"}`,
            503,
          );
        await this.sleep(Math.min(100 * 2 ** transportAttempts++, 1000));
      }
    }
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
