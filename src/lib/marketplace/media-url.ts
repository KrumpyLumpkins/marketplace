/**
 * Resolves the many ways NFT metadata points at media into URLs a browser can
 * load. Pure and side-effect free so it can run on the server (SEO images) and
 * in the client (cards, detail pages).
 */

export const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
] as const;

export const ARWEAVE_GATEWAY = "https://arweave.net/";

const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[a-z2-7]{58,}|z[1-9A-HJ-NP-Za-km-z]{48,}|F[0-9A-F]{50,})(\/.*)?$/;

function ipfsPath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const scheme = trimmed.match(/^ipfs:\/\/(.+)$/i);
  if (scheme) {
    return scheme[1].replace(/^ipfs\//i, "");
  }

  const gatewayPath = trimmed.match(/^\/?ipfs\/(.+)$/i);
  if (gatewayPath) {
    return gatewayPath[1];
  }

  if (CID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/** Every candidate URL for a media reference, most preferred first. */
export function mediaUrlCandidates(value: string | null | undefined): string[] {
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (/^data:image\//i.test(trimmed)) {
    return [trimmed];
  }

  if (/^(https?:)?\/\//i.test(trimmed)) {
    const absolute = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    const existingGateway = absolute.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/i);
    if (existingGateway) {
      const path = existingGateway[1];
      return [absolute, ...IPFS_GATEWAYS.map((gateway) => `${gateway}${path}`)].filter(
        (candidate, index, all) => all.indexOf(candidate) === index,
      );
    }
    return [absolute];
  }

  if (/^ar:\/\//i.test(trimmed)) {
    return [`${ARWEAVE_GATEWAY}${trimmed.replace(/^ar:\/\//i, "")}`];
  }

  const path = ipfsPath(trimmed);
  if (path) {
    return IPFS_GATEWAYS.map((gateway) => `${gateway}${path}`);
  }

  if (trimmed.startsWith("/")) {
    return [trimmed];
  }

  return [];
}

/** The best single URL for a media reference, or null when it cannot be displayed. */
export function resolveMediaUrl(value: string | null | undefined): string | null {
  return mediaUrlCandidates(value)[0] ?? null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * Ordered media references found on an indexed token: the cached asset first,
 * then every origin the metadata exposes (including the backend's
 * `imageSourceUri`, written when caching failed).
 */
export function tokenMediaCandidates(token: {
  image?: string | null;
  metadata?: unknown;
}): string[] {
  const metadata = asRecord(token.metadata);
  const references = [
    token.image,
    metadata?.image,
    metadata?.imageSourceUri,
    metadata?.image_url,
    metadata?.imageUrl,
    metadata?.animation_url,
    metadata?.image_data,
  ];

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const reference of references) {
    if (typeof reference !== "string") continue;
    const value = reference.trim();
    if (!value) continue;
    const svgInline =
      /^<svg[\s>]/i.test(value) ? `data:image/svg+xml;utf8,${encodeURIComponent(value)}` : null;
    for (const candidate of svgInline ? [svgInline] : mediaUrlCandidates(value)) {
      if (!seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}
