import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { address, uint, ApiError } from "./domain.mjs";
const schema = JSON.parse(
  readFileSync(
    new URL("../../../config/marketplace/auth-schema.json", import.meta.url),
  ),
);
const P = (1n << 251n) + 17n * (1n << 192n) + 1n;
const mod = (n) => ((n % P) + P) % P;
const constants = Array.from(
  { length: 273 },
  (_, i) =>
    BigInt("0x" + createHash("sha256").update(`Hades${i}`).digest("hex")) % P,
);
// Starknet Hades permutation: width 3, 8 full / 83 partial rounds, x^3 S-box.
// Protocol reference: https://github.com/starkware-industries/poseidon
export function poseidonMany(input) {
  const data = input.map((x) => {
    const n = BigInt(x);
    if (n < 0n || n >= P)
      throw new ApiError("INVALID_FELT", "Invalid message field.");
    return n;
  });
  data.push(1n);
  if (data.length % 2) data.push(0n);
  let state = [0n, 0n, 0n];
  for (let pos = 0; pos < data.length; pos += 2) {
    state[0] = mod(state[0] + data[pos]);
    state[1] = mod(state[1] + data[pos + 1]);
    for (let round = 0; round < 91; round++) {
      state = state.map((x, i) => mod(x + constants[round * 3 + i]));
      if (round < 4 || round >= 87) state = state.map((x) => mod(x * x * x));
      else state[2] = mod(state[2] * state[2] * state[2]);
      const [a, b, c] = state;
      state = [mod(3n * a + b + c), mod(a - b + c), mod(a + b - 2n * c)];
    }
  }
  return state[0];
}
const felt = (s) =>
  /^(0x[\da-f]+|\d+)$/i.test(String(s))
    ? BigInt(s)
    : BigInt("0x" + Buffer.from(s, "ascii").toString("hex"));
export function loginHash(data, account) {
  const d = data.domain,
    m = data.message;
  const domain = poseidonMany([
    schema.domainTypeHash,
    felt(d.name),
    felt(d.version),
    felt(d.chainId),
    felt(d.revision),
  ]);
  const message = poseidonMany([
    schema.loginTypeHash,
    m.origin,
    m.nonce,
    m.expires,
  ]);
  return (
    "0x" +
    poseidonMany([
      felt("StarkNet Message"),
      domain,
      address(account),
      message,
    ]).toString(16)
  );
}
const digest = (v) => createHash("sha256").update(v).digest("hex");
export class Auth {
  constructor(store, { origin, chainId, verify, now = () => Date.now() }) {
    this.db = store.app;
    this.origin = new URL(origin).origin;
    this.chainId = chainId;
    this.verifySignature = verify;
    this.now = now;
  }
  challenge(account, origin) {
    if (origin !== this.origin)
      throw new ApiError(
        "ORIGIN_MISMATCH",
        "Authentication origin mismatch.",
        403,
      );
    const a = address(account);
    if (BigInt(a) === 0n)
      throw new ApiError("INVALID_ACCOUNT", "Account is required.");
    const expires = Math.floor(this.now() / 1000) + 300,
      id = randomBytes(24).toString("hex");
    const typedData = {
      types: schema.types,
      primaryType: "Login",
      domain: {
        name: "Biblio Marketplace",
        version: "1",
        chainId: this.chainId,
        revision: "1",
      },
      message: {
        origin: (BigInt("0x" + digest(this.origin)) % P).toString(),
        nonce: (BigInt("0x" + randomBytes(32).toString("hex")) % P).toString(),
        expires: String(expires),
      },
    };
    this.db
      .prepare("DELETE FROM challenges WHERE expires<?")
      .run(Math.floor(this.now() / 1000));
    this.db
      .prepare(
        "INSERT INTO challenges(id,account,message,expires) VALUES(?,?,?,?)",
      )
      .run(id, a, JSON.stringify(typedData), expires);
    return {
      id,
      account: a,
      typedData,
      hash: loginHash(typedData, a),
      expires,
      origin: this.origin,
    };
  }
  async verify(id, signature) {
    if (
      !Array.isArray(signature) ||
      !signature.length ||
      signature.length > 256
    )
      throw new ApiError("INVALID_SIGNATURE", "Invalid signature.");
    const c = this.db.prepare("SELECT * FROM challenges WHERE id=?").get(id);
    if (!c || c.used || c.expires <= Math.floor(this.now() / 1000))
      throw new ApiError(
        "CHALLENGE_EXPIRED",
        "Challenge is expired or used.",
        401,
      );
    const sig = signature.map((v) => uint(v, 252));
    if (
      !(await this.verifySignature(
        c.account,
        loginHash(JSON.parse(c.message), c.account),
        sig,
      ))
    )
      throw new ApiError(
        "INVALID_SIGNATURE",
        "Wallet signature was not accepted.",
        401,
      );
    const used = this.db
      .prepare(
        "UPDATE challenges SET used=1 WHERE id=? AND used=0 AND expires>?",
      )
      .run(id, Math.floor(this.now() / 1000));
    if (!used.changes)
      throw new ApiError(
        "CHALLENGE_EXPIRED",
        "Challenge has already been used.",
        401,
      );
    const token = randomBytes(32).toString("base64url"),
      expires = Math.floor(this.now() / 1000) + 86400;
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(digest(token), c.account, expires);
    return { token, account: c.account, expires };
  }
  account(token) {
    if (!token) return null;
    return (
      this.db
        .prepare(
          "SELECT account FROM sessions WHERE token_hash=? AND expires>?",
        )
        .get(digest(token), Math.floor(this.now() / 1000))?.account ?? null
    );
  }
  logout(token) {
    if (token)
      this.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(digest(token));
  }
}
