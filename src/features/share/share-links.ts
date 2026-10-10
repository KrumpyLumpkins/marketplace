/** Links and text for sharing marketplace pages. */

/** The page URL to share: the current origin, without query or fragment. */
export function absoluteShareUrl(pathname: string, origin: string) {
  const url = new URL(pathname, origin);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function assetShareText({ name, price }: { name: string; price: string | null }) {
  return price ? `${name} for ${price} on Realms.market` : `${name} on Realms.market`;
}

export function xShareUrl({ text, url }: { text: string; url: string }) {
  const intent = new URL("https://x.com/intent/post");
  intent.searchParams.set("text", text);
  intent.searchParams.set("url", url);
  return intent.toString();
}
