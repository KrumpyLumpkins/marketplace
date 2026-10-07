export const CART_MAX_ITEMS = 25;
export function canAddCartItem(
  items: ReadonlyArray<{ orderId: string; currency: string }>,
  item: { orderId: string; currency: string },
): { ok: boolean; error?: string } {
  if (items.some((i) => i.orderId === item.orderId))
    return { ok: false, error: "Already in cart." };
  if (items.length >= CART_MAX_ITEMS)
    return {
      ok: false,
      error: `Cart maximum ${CART_MAX_ITEMS} items reached.`,
    };
  if (items.length && BigInt(items[0].currency) !== BigInt(item.currency))
    return { ok: false, error: "Cart only supports a single currency." };
  return { ok: true };
}
export function compareAmounts(left: string, right: string) {
  try {
    const a = BigInt(left),
      b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  } catch {
    return left.localeCompare(right);
  }
}
