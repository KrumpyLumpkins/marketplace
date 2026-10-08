import { describe, expect, it } from "vitest";
import {
  IPFS_GATEWAYS,
  mediaUrlCandidates,
  resolveMediaUrl,
  tokenMediaCandidates,
} from "./media-url";

const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

describe("resolveMediaUrl", () => {
  it("keeps http(s) and relative asset paths untouched", () => {
    expect(resolveMediaUrl("https://cdn.example/art.png")).toBe("https://cdn.example/art.png");
    expect(resolveMediaUrl("/api/marketplace/v1/chains/SN_MAIN/assets/abc.png")).toBe(
      "/api/marketplace/v1/chains/SN_MAIN/assets/abc.png",
    );
  });

  it("rewrites ipfs schemes, gateway paths and bare CIDs to a public gateway", () => {
    expect(resolveMediaUrl(`ipfs://${CID}/1.png`)).toBe(`${IPFS_GATEWAYS[0]}${CID}/1.png`);
    expect(resolveMediaUrl(`ipfs://ipfs/${CID}`)).toBe(`${IPFS_GATEWAYS[0]}${CID}`);
    expect(resolveMediaUrl(`/ipfs/${CID}`)).toBe(`${IPFS_GATEWAYS[0]}${CID}`);
    expect(resolveMediaUrl(CID)).toBe(`${IPFS_GATEWAYS[0]}${CID}`);
  });

  it("offers alternate gateways for ipfs content so a failing gateway can be skipped", () => {
    const candidates = mediaUrlCandidates(`ipfs://${CID}`);
    expect(candidates).toHaveLength(IPFS_GATEWAYS.length);
    expect(new Set(candidates).size).toBe(candidates.length);

    const fromGateway = mediaUrlCandidates(`https://nftstorage.link/ipfs/${CID}`);
    expect(fromGateway[0]).toBe(`https://nftstorage.link/ipfs/${CID}`);
    expect(fromGateway).toContain(`${IPFS_GATEWAYS[1]}${CID}`);
  });

  it("supports arweave and inline data images", () => {
    expect(resolveMediaUrl("ar://abc123")).toBe("https://arweave.net/abc123");
    expect(resolveMediaUrl("data:image/svg+xml;base64,PHN2Zy8+")).toBe(
      "data:image/svg+xml;base64,PHN2Zy8+",
    );
  });

  it("rejects values that cannot be displayed", () => {
    expect(resolveMediaUrl("")).toBeNull();
    expect(resolveMediaUrl("   ")).toBeNull();
    expect(resolveMediaUrl("javascript:alert(1)")).toBeNull();
    expect(resolveMediaUrl("not a url")).toBeNull();
    expect(resolveMediaUrl(null)).toBeNull();
  });
});

describe("tokenMediaCandidates", () => {
  it("prefers the cached asset, then falls back to the origin the backend preserved", () => {
    expect(
      tokenMediaCandidates({
        image: null,
        metadata: { image: null, imageSourceUri: `ipfs://${CID}/realm.png` },
      }),
    ).toEqual(IPFS_GATEWAYS.map((gateway) => `${gateway}${CID}/realm.png`));

    expect(
      tokenMediaCandidates({
        image: "/assets/cached.png",
        metadata: { image: "https://origin.example/realm.png" },
      }),
    ).toEqual(["/assets/cached.png", "https://origin.example/realm.png"]);
  });

  it("reads legacy image_url and inline svg image_data", () => {
    expect(
      tokenMediaCandidates({ metadata: { image_url: "https://origin.example/legacy.png" } }),
    ).toEqual(["https://origin.example/legacy.png"]);
    const [svg] = tokenMediaCandidates({ metadata: { image_data: "<svg xmlns='x'></svg>" } });
    expect(svg.startsWith("data:image/svg+xml;utf8,")).toBe(true);
  });

  it("dedupes repeated references and ignores empty strings", () => {
    expect(
      tokenMediaCandidates({
        image: "",
        metadata: { image: "https://a.example/x.png", image_url: "https://a.example/x.png" },
      }),
    ).toEqual(["https://a.example/x.png"]);
  });
});
