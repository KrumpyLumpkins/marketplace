import { MarketPrice } from "@/components/marketplace/market-price";
import { Button } from "@/components/ui/button";
export function ListingPurchase({
  price,
  currency,
  inCart = false,
  isOwner = false,
  onAdd,
  onViewCart,
}: {
  price?: string;
  currency?: string;
  inCart?: boolean;
  isOwner?: boolean;
  onAdd: () => void;
  onViewCart?: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {price ? "Price" : "Listing status"}
      </p>
      <p className="text-2xl">
        <MarketPrice amount={price} currency={currency} />
      </p>
      {price && (
        <>
          <p className="text-xs text-muted-foreground">
            Includes marketplace fees and royalties. Network fees are separate.
          </p>
          <Button
            className="w-full"
            disabled={isOwner}
            onClick={inCart ? onViewCart : onAdd}
          >
            {isOwner
              ? "You own this item"
              : inCart
                ? "View cart"
                : "Add to cart"}
          </Button>
          {inCart && (
            <p role="status" className="text-sm">
              Added to your cart
            </p>
          )}
        </>
      )}
    </div>
  );
}
