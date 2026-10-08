"use client";
import { MarketPrice } from "@/components/marketplace/market-price";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { animate, stagger } from "animejs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type HeroBannerProps = {
  name: string;
  address: string;
  imageUrl?: string | null;
  floorPrice?: string | null;
  floorCurrency?: string | null;
  totalSupply?: string | null;
  listingCount?: string | null;
  isLoading?: boolean;
};

export function HeroBanner({
  name,
  address,
  imageUrl,
  floorPrice,
  floorCurrency,
  totalSupply,
  listingCount,
  isLoading = false,
}: HeroBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || isLoading) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    animate(el.querySelectorAll(".hero-image"), { opacity: [0, 1], duration: 600, ease: "easeOutCubic" });
    animate(el.querySelectorAll(".hero-overlay"), { opacity: [0, 1], translateY: [20, 0], duration: 400, delay: 200, ease: "easeOutCubic" });
    animate(el.querySelectorAll(".hero-title"), { opacity: [0, 1], translateY: [16, 0], duration: 500, delay: 300, ease: "easeOutCubic" });
    animate(el.querySelectorAll(".hero-stat"), { opacity: [0, 1], translateY: [12, 0], delay: stagger(80, { start: 400 }), duration: 500, ease: "easeOutCubic" });
    animate(el.querySelectorAll(".hero-cta"), { opacity: [0, 1], duration: 400, delay: 600, ease: "easeOutCubic" });
  }, [isLoading]);

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading featured collection" data-testid="hero-banner" className="relative h-56 w-full overflow-hidden rounded-[8px] border border-[color:var(--realm-border-etched)] sm:h-72 lg:h-80">
        <Skeleton data-testid="hero-banner-skeleton" className="h-full w-full rounded-none" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="hero-banner"
      className="relative h-56 w-full overflow-hidden rounded-[8px] border border-[color:var(--realm-border-etched)] shadow-[0_22px_55px_rgba(0,0,0,0.34)] sm:h-72 lg:h-80"
    >
      {/* Background image */}
      <div className="hero-image absolute inset-0">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${name} banner`}
            src={imageUrl}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            data-testid="hero-banner-gradient-fallback"
            className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(231,207,136,0.24),transparent_28rem),linear-gradient(145deg,#161b20,#070b0d_55%,#050709)]"
          />
        )}
      </div>

      {/* Gradient overlay — stronger at bottom for text readability */}
      <div className="hero-overlay absolute inset-0 bg-gradient-to-t from-[color:var(--realm-bg-void)] via-[color:var(--realm-bg-void)]/60 to-transparent" />

      {/* Content overlay — positioned at bottom */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4 sm:px-6 sm:pb-6">
        {/* Title row */}
        <div className="hero-title flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="realm-title text-3xl text-[color:var(--realm-title)] drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)] sm:text-4xl">
              {name}
            </h2>
          </div>
          <Button asChild size="sm" className="hero-cta shrink-0">
            <Link href={`/collections/${address}`}>View Collection</Link>
          </Button>
        </div>

        {/* Stats row — glass pills */}
        <div className="flex flex-wrap gap-2">
          <div className="hero-stat realm-stat-pill px-3 py-1.5 text-xs backdrop-blur-md sm:text-sm">
            <span className="text-muted-foreground mr-1.5">Floor</span>
            <span className="font-medium text-foreground"><MarketPrice amount={floorPrice} currency={floorCurrency} formatted empty="No listings" /></span>
          </div>
          <div className="hero-stat realm-stat-pill px-3 py-1.5 text-xs backdrop-blur-md sm:text-sm">
            <span className="text-muted-foreground mr-1.5">Supply</span>
            <span className="font-medium text-foreground">{totalSupply ?? "--"}</span>
          </div>
          <div className="hero-stat realm-stat-pill px-3 py-1.5 text-xs backdrop-blur-md sm:text-sm">
            <span className="text-muted-foreground mr-1.5">Listed</span>
            <span className="font-medium text-foreground">{listingCount ?? "--"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
