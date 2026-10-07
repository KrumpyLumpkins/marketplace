"use client";
import {formatCurrencyAmount} from "@/lib/marketplace/amount-display";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import type { CollectionOrdersOptions } from "@/lib/marketplace/types";
import {
  useCollectionListingsQuery,
  useCollectionOrdersQuery,
} from "@/lib/marketplace/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatAddress,
  formatNumberish,
  formatPriceForDisplay,
  tokenId,
  tokenImage,
} from "@/lib/marketplace/token-display";
import { getCollectionFilterConfig } from "@/lib/marketplace/collection-filter-config";
import { ResourceTraitIcons } from "@/components/marketplace/resource-trait-icons";
import { resolveMarketActivityDetails } from "@/lib/marketplace/market-activity-details";
import { useEntrance } from "@/lib/animation";

type CollectionMarketPanelProps = {
  address: string;
  projectId?: string;
};

const ORDER_STATUS_VALUES = ["None", "Placed", "Canceled", "Executed"] as const;
const ORDER_CATEGORY_VALUES = ["None", "Buy", "Sell"] as const;

// Sentinel used in the Select UI for the "Any / unfiltered" option.
// Radix Select does not allow value="" for SelectItem.
const ANY_VALUE = "__any__";

type OrderStatusFilter = Exclude<CollectionOrdersOptions["status"], undefined>;
type OrderCategoryFilter = Exclude<CollectionOrdersOptions["category"], undefined>;
type ActivityKind = "Order" | "Listing";
type ActivityRow = {
  kind: ActivityKind;
  id: string;
  tokenId: string | null;
  routeTokenId: string | null;
  tokenImage: string | null;
  price: string | null;
  owner: string | null;
  status: string | null;
  occurredAt: string | null;
  href: string | null;
  extraDetails: Array<{ label: string | null; value: string }>;
};

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(candidates: unknown[]) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function firstNumberish(candidates: unknown[]) {
  for (const candidate of candidates) {
    const normalized = formatNumberish(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function formatActivityDate(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`;
    }
  }

  if (typeof value === "number" || typeof value === "bigint") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      const millis = asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
      const parsed = new Date(millis);
      if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`;
      }
    }
  }

  return null;
}

function firstTokenImage(candidates: unknown[]) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const resolvedImage = tokenImage(candidate as never);
    if (resolvedImage) {
      return resolvedImage;
    }
  }

  return null;
}

function firstRouteTokenId(candidates: unknown[]) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const fields = asRecord(candidate);
    if (!fields) {
      continue;
    }

    const resolvedTokenId = fields.token_id ?? fields.tokenId;
    if (
      typeof resolvedTokenId === "string"
      || typeof resolvedTokenId === "number"
      || typeof resolvedTokenId === "bigint"
    ) {
      return tokenId(candidate as never);
    }
  }

  return null;
}

function displayStatus(status: string | null) {
  if (status === "Executed") {
    return "Filled";
  }

  return status;
}

function firstToken(candidates: unknown[]) {
  for (const candidate of candidates) {
    if (asRecord(candidate)) {
      return candidate;
    }
  }

  return null;
}

function toActivityRow(
  raw: unknown,
  kind: ActivityKind,
  address: string,
  marketActivity: NonNullable<ReturnType<typeof getCollectionFilterConfig>["marketActivity"]> | undefined,
): ActivityRow | null {
  const fields = asRecord(raw);
  if (!fields) {
    return null;
  }

  const nestedOrder = asRecord(fields.order);
  const nestedListing = asRecord(fields.listing);
  const id =
    firstNumberish([fields.id, nestedOrder?.id, nestedListing?.id]) ??
    firstString([fields.id, nestedOrder?.id, nestedListing?.id]);
  if (!id) {
    return null;
  }

  const tokenId = firstNumberish([
    fields.tokenId,
    fields.token_id,
    nestedOrder?.tokenId,
    nestedOrder?.token_id,
    nestedListing?.tokenId,
    nestedListing?.token_id,
  ]);
  const routeTokenId =
    firstRouteTokenId([
      fields.token,
      nestedOrder?.token,
      nestedListing?.token,
    ]) ??
    firstString([
      fields.tokenId,
      fields.token_id,
      nestedOrder?.tokenId,
      nestedOrder?.token_id,
      nestedListing?.tokenId,
      nestedListing?.token_id,
    ]) ??
    tokenId;
  const token = firstToken([
    fields.token,
    nestedOrder?.token,
    nestedListing?.token,
  ]);
  const rawPrice = firstNumberish([
    fields.price,
    fields.listingPrice,
    fields.listing_price,
    nestedOrder?.price,
    nestedOrder?.listingPrice,
    nestedOrder?.listing_price,
    nestedListing?.price,
    nestedListing?.listingPrice,
    nestedListing?.listing_price,
  ]);
  const owner = firstString([
    fields.owner,
    fields.maker,
    fields.seller,
    fields.account,
    nestedOrder?.owner,
    nestedOrder?.maker,
    nestedOrder?.seller,
    nestedListing?.owner,
    nestedListing?.seller,
  ]);
  const status = firstString([
    fields.status,
    fields.state,
    nestedOrder?.status,
    nestedListing?.status,
  ]);
  const tokenImage = firstString([
    fields.image,
    fields.tokenImage,
    fields.token_image,
    nestedOrder?.image,
    nestedOrder?.tokenImage,
    nestedListing?.image,
    nestedListing?.tokenImage,
  ]) ?? firstTokenImage([token]);
  const occurredAt = formatActivityDate(
    fields.updatedAt ??
      fields.updated_at ??
      fields.createdAt ??
      fields.created_at ??
      fields.timestamp ??
      fields.time ??
      nestedOrder?.updatedAt ??
      nestedOrder?.createdAt ??
      nestedListing?.updatedAt ??
      nestedListing?.createdAt,
  );
  const href = routeTokenId ? `/collections/${address}/${routeTokenId}` : null;
  const extraDetails = resolveMarketActivityDetails(token, marketActivity);

  return {
    kind,
    id,
    tokenId,
    routeTokenId,
    tokenImage,
    price: fields.apiOrder && rawPrice!=null ? formatCurrencyAmount(String(rawPrice),String(fields.currency)) : formatPriceForDisplay(rawPrice),
    owner: owner ? formatAddress(owner) : null,
    status,
    occurredAt,
    href,
    extraDetails,
  };
}

function ActivityRowItem({
  row,
  renderResourcesAsIcons,
}: {
  row: ActivityRow;
  renderResourcesAsIcons?: boolean;
}) {
  return (
    <div data-activity-row className="realm-panel px-4 py-3 transition-all duration-200 hover:border-[color:var(--realm-border-strong)] hover:shadow-[0_0_18px_rgba(231,207,136,0.12)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {row.tokenImage ? (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-[color:var(--realm-border-etched)] bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={row.tokenId ? `Token #${row.tokenId} preview` : `${row.kind} preview`}
                className="h-full w-full object-cover"
                src={row.tokenImage}
              />
            </div>
          ) : null}
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-[color:var(--realm-title)]">
              {row.tokenId ? `Token #${row.tokenId}` : row.kind}
            </p>
            {row.extraDetails.length > 0 ? (
              renderResourcesAsIcons ? (
                <ResourceTraitIcons resources={row.extraDetails.map((detail) => detail.value)} />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {row.extraDetails.map((detail) => (
                    <span
                      key={`${detail.label ?? "value"}-${detail.value}`}
                      className="inline-flex items-center rounded-[6px] border border-[color:var(--realm-border-etched)] bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                    >
                      {detail.label ? `${detail.label} ${detail.value}` : detail.value}
                    </span>
                  ))}
                </div>
              )
            ) : null}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {row.price ? <span>Price {row.price}</span> : null}
              {row.owner ? <span>Owner {row.owner}</span> : null}
              {displayStatus(row.status) ? <span>Status {displayStatus(row.status)}</span> : null}
              {row.occurredAt ? <span>{row.occurredAt}</span> : null}
            </div>
          </div>
        </div>
        {row.href ? (
          <Button asChild size="sm" type="button" variant="outline" className="shrink-0">
            <Link href={row.href}>View token</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function parseOrderStatus(value: string): OrderStatusFilter | undefined {
  if (value === ANY_VALUE || value === "") return undefined;
  const trimmed = value.trim();
  if ((ORDER_STATUS_VALUES as readonly string[]).includes(trimmed)) {
    return trimmed as OrderStatusFilter;
  }

  return undefined;
}

function parseOrderCategory(value: string): OrderCategoryFilter | undefined {
  if (value === ANY_VALUE || value === "") return undefined;
  const trimmed = value.trim();
  if ((ORDER_CATEGORY_VALUES as readonly string[]).includes(trimmed)) {
    return trimmed as OrderCategoryFilter;
  }

  return undefined;
}

function parseListingTokenId(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

export function CollectionMarketPanel({
  address,
  projectId,
}: CollectionMarketPanelProps) {
  const collectionConfig = useMemo(() => getCollectionFilterConfig(address), [address]);
  const [orderStatus, setOrderStatus] = useState(ANY_VALUE);
  const [orderCategory, setOrderCategory] = useState(ANY_VALUE);
  const [listingTokenId, setListingTokenId] = useState("");
  const [verifyOwnership, setVerifyOwnership] = useState(false);

  const parsedOrderStatus = useMemo(
    () => parseOrderStatus(orderStatus),
    [orderStatus],
  );
  const parsedOrderCategory = useMemo(
    () => parseOrderCategory(orderCategory),
    [orderCategory],
  );
  const deferredListingTokenId = useDeferredValue(listingTokenId);
  const listingTokenFilter = useMemo(
    () => parseListingTokenId(deferredListingTokenId),
    [deferredListingTokenId],
  );

  const ordersRef = useEntrance<HTMLDivElement>({
    selector: "[data-activity-row]",
    staggerDelay: 40,
    translateY: 10,
  });

  const listingsAnimRef = useEntrance<HTMLDivElement>({
    selector: "[data-activity-row]",
    staggerDelay: 40,
    translateY: 10,
  });

  const orders = useCollectionOrdersQuery({
    collection: address,
    status: parsedOrderStatus,
    category: parsedOrderCategory,
    limit: 24,
  });
  const listings = useCollectionListingsQuery({
    collection: address,
    tokenId: listingTokenFilter,
    limit: 24,
    verifyOwnership,
    projectId,
  });
  const orderRows = useMemo(
    () =>
      (Array.isArray(orders.data) ? orders.data : [])
        .map((order) => toActivityRow(order, "Order", address, collectionConfig.marketActivity))
        .filter((row): row is ActivityRow => row !== null),
    [address, collectionConfig.marketActivity, orders.data],
  );
  const listingRows = useMemo(
    () =>
      (Array.isArray(listings.data) ? listings.data : [])
        .map((listing) => toActivityRow(listing, "Listing", address, collectionConfig.marketActivity))
        .filter((row): row is ActivityRow => row !== null),
    [address, collectionConfig.marketActivity, listings.data],
  );

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium tracking-widest uppercase">Market Activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="orders">
          <TabsList className="mb-4">
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="listings">Listings</TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <section className="space-y-4" data-testid="orders-panel">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground" htmlFor="order-status">
                    Order status
                  </label>
                  <Select value={orderStatus} onValueChange={setOrderStatus}>
                    <SelectTrigger id="order-status" aria-label="Order status">
                    <SelectValue placeholder="Any status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_VALUE}>Any</SelectItem>
                    <SelectItem value="Placed">Placed</SelectItem>
                    <SelectItem value="Canceled">Canceled</SelectItem>
                    <SelectItem value="Executed">Filled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground" htmlFor="order-category">
                    Order category
                  </label>
                  <Select value={orderCategory} onValueChange={setOrderCategory}>
                    <SelectTrigger id="order-category" aria-label="Order category">
                      <SelectValue placeholder="Any category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_VALUE}>Any</SelectItem>
                      <SelectItem value="Buy">Buy</SelectItem>
                      <SelectItem value="Sell">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {orders.isError ? (
                <p className="text-sm text-destructive">Orders failed to load.</p>
              ) : null}

              {orders.isSuccess ? (
                <div ref={ordersRef} className="space-y-2">
                  {orderRows.map((row) => (
                    <ActivityRowItem
                      key={`${row.kind}-${row.id}-${row.tokenId ?? "none"}`}
                      row={row}
                      renderResourcesAsIcons={collectionConfig.marketActivity?.renderResourcesAsIcons}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="listings">
            <section className="space-y-4" data-testid="listings-panel">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground" htmlFor="listing-token-id">
                    Listing token id
                  </label>
                  <Input
                    id="listing-token-id"
                    onChange={(event) => setListingTokenId(event.target.value)}
                    placeholder="Filter by token id"
                    value={listingTokenId}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Switch
                    aria-label="Verify ownership"
                    checked={verifyOwnership}
                    id="verify-ownership"
                    onCheckedChange={setVerifyOwnership}
                  />
                  <label className="text-sm" htmlFor="verify-ownership">
                    Verify ownership
                  </label>
                </div>
              </div>

              {listings.isError ? (
                <p className="text-sm text-destructive">Listings failed to load.</p>
              ) : null}

              {listings.isSuccess ? (
                <div ref={listingsAnimRef} className="space-y-2">
                  {listingRows.map((row) => (
                    <ActivityRowItem
                      key={`${row.kind}-${row.id}-${row.tokenId ?? "none"}`}
                      row={row}
                      renderResourcesAsIcons={collectionConfig.marketActivity?.renderResourcesAsIcons}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
