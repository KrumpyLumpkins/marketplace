"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAccount, useDisconnect } from "@starknet-react/core";
import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletConnectButton } from "./wallet-connect-button";
import { WalletBalances } from "./wallet-balances";
import { ECOSYSTEM_LINKS, SOCIAL_LINKS } from "./social-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MarketStatusLink } from "@/features/trading/market-status-link";
import { cn } from "@/lib/utils";

const CartSidebar = dynamic(
  () =>
    import("@/features/cart/components/cart-sidebar").then((m) => ({
      default: m.CartSidebar,
    })),
  { ssr: false },
);

const destinations = [
  {
    label: "Explore",
    href: "/",
    matches: (path: string) => path === "/" || path.startsWith("/collections"),
  },
  {
    label: "Portfolio",
    href: "/portfolio",
    matches: (path: string) =>
      path.startsWith("/portfolio") || path.startsWith("/profile"),
  },
  {
    label: "Trading",
    href: "/trader",
    matches: (path: string) => path.startsWith("/trader"),
  },
];

/** Kept for consumers that list the ecosystem destinations (footer, docs). */
export const ecosystemLinks = ECOSYSTEM_LINKS.filter((link) => link.external).map(
  ({ label, href }) => ({ label, href }),
);

function WalletControl({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { address, isConnected } = useAccount();
  const { disconnect, isPending } = useDisconnect();
  return isConnected && address ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-11 font-mono text-xs"
          data-testid={mobile ? "mobile-wallet-address" : "wallet-address"}
        >
          {address.slice(0, 6)}...{address.slice(-4)}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <WalletBalances walletAddress={address} />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/profile/${address}`} onClick={onNavigate}>Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/trader" onClick={onNavigate}>Trading dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isPending} onClick={() => disconnect()}>
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <WalletConnectButton className="h-11 whitespace-nowrap px-3" />
  );
}

function ecosystemLinkClass(isCurrent: boolean) {
  return cn(
    "realm-nav-link inline-flex min-h-11 items-center px-1 text-[11px] uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isCurrent ? "realm-nav-link-active text-primary" : "text-foreground/70 hover:text-primary",
  );
}

/**
 * Two-tier chrome: the Realms.World ecosystem bar on top (same sections and
 * community links as the rest of the site), then the sticky marketplace tools.
 */
export function MarketplaceHeader() {
  const path = usePathname() ?? "/";
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState({ query, value: query });
  if (searchDraft.query !== query) setSearchDraft({ query, value: query });
  const searchInput = searchDraft.query === query ? searchDraft.value : query;
  const setSearchInput = (value: string) => setSearchDraft({ query, value });
  const [menuOpen, setMenuOpen] = useState(false);
  const firstMobileLink = useRef<HTMLAnchorElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  function searchForm(mobile = false) {
    return (
      <form
        role="search"
        className="relative flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const normalized = searchInput.trim().replace(/\s+/g, " ");
          setSearchOpen(false);
          router.push(
            normalized ? `/?q=${encodeURIComponent(normalized)}` : "/",
          );
        }}
      >
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
        />
        <Input
          aria-label="Search"
          placeholder="Search collections, items…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="h-10 pl-9"
        />
        {mobile && (
          <Button type="submit" className="h-11">
            Search
          </Button>
        )}
      </form>
    );
  }

  const linkClass =
    "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary";

  return (
    <header className="sticky top-0 z-40 w-full">
      {/* Realms.World ecosystem bar */}
      <div
        data-testid="ecosystem-bar"
        className="realm-market-header-shell h-11 border-x-0 border-t-0 bg-black/55 backdrop-blur-xl supports-[backdrop-filter]:bg-black/45"
      >
        <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-6">
          <a
            href="https://realms.world/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Realms.World home"
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rw-logo.svg" alt="" data-testid="realms-logo" className="w-8 object-contain" />
            <span className="realm-title text-sm leading-none lg:hidden">Realms.World</span>
          </a>
          <nav
            aria-label="Realms ecosystem"
            className="hidden items-center gap-5 lg:flex xl:gap-7"
          >
            {ECOSYSTEM_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ecosystemLinkClass(false)}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  aria-current="page"
                  className={ecosystemLinkClass(true)}
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
          <div className="hidden items-center gap-1 lg:flex">
            {SOCIAL_LINKS.map(({ label, href, Icon, iconClassName }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="inline-flex size-9 items-center justify-center rounded-md text-foreground/55 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className={iconClassName} />
              </a>
            ))}
          </div>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                className="size-11 lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                firstMobileLink.current?.focus();
              }}
              className="w-full max-w-sm gap-0 overflow-y-auto [&>button]:top-2 [&>button]:right-2 [&>button]:size-11 data-[state=open]:duration-200 data-[state=closed]:duration-150 motion-reduce:animate-none"
            >
              <SheetHeader className="border-b py-6">
                <SheetTitle className="realm-title">Marketplace menu</SheetTitle>
                <SheetDescription>Explore, collect and trade Realms.</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile marketplace" className="flex flex-col gap-1 p-4">
                {[
                  ...destinations,
                  {
                    label: "Notifications",
                    href: "/notifications",
                    matches: (p: string) => p === "/notifications",
                  },
                ].map((link) => (
                  <Link
                    key={link.label}
                    ref={link.label === "Explore" ? firstMobileLink : undefined}
                    href={link.href}
                    aria-current={link.matches(path) ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={linkClass}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="border-y p-4">
                <WalletControl mobile onNavigate={() => setMenuOpen(false)} />
              </div>
              <div className="p-4">
                <MarketStatusLink onNavigate={() => setMenuOpen(false)} />
              </div>
              <div className="mt-auto space-y-4 p-4">
                <nav aria-label="Realms ecosystem (menu)" className="space-y-2">
                  <p className="realm-kicker text-xs">Realms.World</p>
                  <div className="grid grid-cols-2 gap-1">
                    {ECOSYSTEM_LINKS.map((link) =>
                      link.external ? (
                        <a
                          key={link.label}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={linkClass}
                        >
                          {link.label}
                          <span className="sr-only"> (opens realms.world)</span>
                        </a>
                      ) : (
                        <Link
                          key={link.label}
                          href={link.href}
                          aria-current="page"
                          onClick={() => setMenuOpen(false)}
                          className={linkClass}
                        >
                          {link.label}
                        </Link>
                      ),
                    )}
                  </div>
                </nav>
                <div className="flex items-center gap-2">
                  {SOCIAL_LINKS.map(({ label, href, Icon, iconClassName }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="flex size-11 items-center justify-center rounded-md border border-[color:var(--realm-border-etched)] text-muted-foreground transition-colors hover:border-[color:var(--realm-border-strong)] hover:text-foreground"
                    >
                      <Icon className={iconClassName} />
                    </a>
                  ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Marketplace tools */}
      <div className="h-16 border-b border-[color:var(--realm-border-etched)] bg-background/95 backdrop-blur-xl">
        <div className="flex h-full items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <Link
            href="/"
            aria-label="Realms Market home"
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-md pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="realm-title text-base leading-tight">
              Realms
              <span className="block font-sans text-[10px] tracking-[0.18em] text-muted-foreground">
                MARKET
              </span>
            </span>
          </Link>
          <nav aria-label="Marketplace" className="hidden items-center lg:flex">
            {destinations.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                aria-current={link.matches(path) ? "page" : undefined}
                className={linkClass}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="hidden min-w-0 flex-1 lg:block lg:max-w-xl">{searchForm()}</div>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  className="size-11 lg:hidden"
                  aria-label="Open search"
                >
                  <Search className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="top"
                className="gap-3 p-4 [&>button]:top-1 [&>button]:right-1 [&>button]:size-11 data-[state=open]:duration-200 data-[state=closed]:duration-150 motion-reduce:animate-none"
                aria-describedby={undefined}
              >
                <SheetHeader className="p-0 pb-3">
                  <SheetTitle>Search marketplace</SheetTitle>
                </SheetHeader>
                {searchForm(true)}
              </SheetContent>
            </Sheet>
            <div className="hidden lg:block">
              <MarketStatusLink compact />
            </div>
            <Button variant="ghost" className="hidden size-11 lg:inline-flex" asChild>
              <Link
                href="/notifications"
                aria-label="Notifications"
                aria-current={path === "/notifications" ? "page" : undefined}
              >
                <Bell className="size-5" />
              </Link>
            </Button>
            <CartSidebar />
            <div className="hidden lg:block">
              <WalletControl />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
