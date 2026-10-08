/** Scoped compatibility for legacy on-chain JSON; no evaluation or general repair. */
export function parseTokenMetadata(text, repairControls = false) {
  if (!repairControls) return JSON.parse(text);
  let result = "",
    inString = false,
    escaped = false;
  for (const char of text) {
    if (inString && char.charCodeAt(0) < 32) {
      if (escaped) throw new Error("Invalid escaped control character");
      result += "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0");
      continue;
    }
    result += char;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
  }
  return JSON.parse(result);
}
export function decodeInlineImage(uri, maxBytes = 10 * 1024 * 1024) {
  if (uri.length > Math.ceil(maxBytes / 3) * 4 + 100)
    throw new Error("Inline image exceeds size limit");
  const match =
    /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      uri,
    );
  if (!match) throw new Error("Unsupported inline image");
  const bytes = Buffer.from(match[2], "base64");
  if (
    bytes.length > maxBytes ||
    bytes.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")
  )
    throw new Error("Invalid or oversized inline image");
  return { bytes, contentType: match[1] };
}
