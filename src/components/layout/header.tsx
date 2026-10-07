"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { type SVGProps, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useDisconnect } from "@starknet-react/core";
import { Github, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletConnectButton } from "./wallet-connect-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WalletBalances } from "@/components/layout/wallet-balances";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";

const CartSidebar = dynamic(
  () =>
    import("@/features/cart/components/cart-sidebar").then((m) => ({
      default: m.CartSidebar,
    })),
  { ssr: false },
);

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const ECOSYSTEM_LINKS = [
  { label: "Home", href: "https://realms.world/", external: true },
  { label: "Games", href: "https://realms.world/games", external: true },
  { label: "Account", href: "https://account.realms.world/velords", external: true },
  { label: "Marketplace", href: "/", external: false },
  { label: "Scroll", href: "https://realms.world/scroll", external: true },
] as const;

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      data-testid="x-icon"
      {...props}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function DiscordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      data-testid="discord-icon"
      {...props}
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  { label: "X / Twitter", href: "https://x.com/LootRealms", Icon: XIcon, iconClassName: "h-3.5 w-3.5" },
  { label: "Discord", href: "https://discord.gg/realmsworld", Icon: DiscordIcon, iconClassName: "h-4 w-4" },
  { label: "GitHub", href: "https://github.com/BibliothecaDAO", Icon: Github, iconClassName: "h-3.5 w-3.5" },
] as const;

function topNavClass(isCurrent = false) {
  return [
    "realm-nav-link text-xs uppercase tracking-[0.15em] transition-colors",
    isCurrent
      ? "realm-nav-link-active text-primary"
      : "text-foreground/75 hover:text-primary",
  ].join(" ");
}

export function Header() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const { disconnect, isPending: isDisconnecting } = useDisconnect();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "");

  const isBusy = isDisconnecting;

  const handleSearchSubmit = () => {
    const normalized = searchInput.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) {
      router.push("/");
      return;
    }

    router.push(`/?q=${encodeURIComponent(normalized)}`);
  };

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="realm-market-header-shell border border-primary/25 bg-black/45 backdrop-blur-xl transition-all duration-300 supports-[backdrop-filter]:bg-black/35">
        <div className="py-3.5 sm:py-4">
          <div className="container mx-auto px-3 sm:px-4">
            <div className="relative flex items-center justify-between gap-2 sm:gap-4">
              <a
              href="https://realms.world/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-left"
              aria-label="Realms.World home"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/rw-logo.svg"
                alt="Realms.World"
                data-testid="realms-logo"
                className="w-11 object-contain sm:w-13"
              />
            </a>

            <nav
              aria-label="Primary ecosystem navigation"
              className="absolute left-1/2 hidden -translate-x-1/2 items-center justify-center gap-5 lg:flex xl:gap-7"
            >
              {ECOSYSTEM_LINKS.map((link) =>
                link.external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={topNavClass()}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={topNavClass(true)}
                    aria-current="page"
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </nav>

            <div className="flex items-center justify-end gap-2 sm:gap-3">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-[6px] border border-[color:var(--realm-border-etched)] bg-[color:var(--realm-surface-iron)]/70 px-2 text-[color:var(--realm-text-muted)] lg:hidden"
                    aria-label="Open navigation menu"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-72 border-[color:var(--realm-border-etched)] bg-[color:var(--realm-bg-void)]"
                >
                  <SheetHeader>
                    <SheetTitle className="realm-title text-left text-base">
                      REALMS.WORLD
                    </SheetTitle>
                  </SheetHeader>
                  <nav aria-label="Mobile navigation" className="mt-6 flex flex-col gap-1">
                    {ECOSYSTEM_LINKS.map((link) =>
                      link.external ? (
                        <a
                          key={link.label}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setMobileMenuOpen(false)}
                          className="rounded-[6px] border border-transparent px-2 py-2.5 text-sm uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-[color:var(--realm-border-etched)] hover:bg-muted/70 hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          key={link.label}
                          href={link.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="rounded-[6px] border border-[color:var(--realm-border-etched)] px-2 py-2.5 text-sm uppercase tracking-[0.12em] text-primary transition-colors hover:bg-muted/70"
                          aria-current="page"
                        >
                          {link.label}
                        </Link>
                      ),
                    )}
                  </nav>
                  <div className="mt-6 flex items-center gap-2 px-2">
                    {SOCIAL_LINKS.map(({ label, href, Icon, iconClassName }) => (
                      <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={label}
                        className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[color:var(--realm-border-etched)] text-muted-foreground transition-colors hover:border-[color:var(--realm-border-strong)] hover:text-foreground"
                      >
                        <Icon className={iconClassName} />
                      </a>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>

              <div className="hidden items-center gap-1 lg:flex">
                {SOCIAL_LINKS.map(({ label, href, Icon, iconClassName }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
                    aria-label={label}
                  >
                    <Icon className={iconClassName} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="border-b border-[color:var(--realm-border-etched)] bg-[color:var(--realm-bg-void)]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-14 items-center px-3 sm:px-4 lg:px-8">
          <div className="flex w-full flex-wrap items-center gap-2 py-2 sm:flex-nowrap sm:gap-3">
            <div className="order-2 flex w-full min-w-0 items-center gap-3 sm:order-none sm:flex-1">
              <Link href="/#collections" aria-label="Browse collections" className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Collections
              </Link>
            <form
              className="relative min-w-0 flex-1"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                handleSearchSubmit();
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                aria-label="Search"
                placeholder="Search collections, items…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="h-9 w-full border-[color:var(--realm-border-etched)] bg-[color:var(--realm-surface-iron)]/80 pl-9 text-foreground placeholder:text-muted-foreground/70 sm:max-w-72 lg:max-w-96"
              />
            </form>
            </div>

            <div className="ml-auto flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
              <CartSidebar />

              <Button
              size="sm"
              variant="ghost"
              asChild
              className="min-h-11 rounded-[6px] border border-[color:var(--realm-border-etched)] bg-[color:var(--realm-surface-iron)]/70 px-3 text-[color:var(--realm-text-muted)] hover:border-[color:var(--realm-border-strong)]"
            >
              <Link href="/portfolio">Portfolio</Link>
              </Button>

              {isConnected && address ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    data-testid="wallet-address"
                    type="button"
                    className="inline-flex h-9 cursor-pointer items-center rounded-[6px] border border-[color:var(--realm-border-etched)] bg-[color:var(--realm-surface-iron)]/80 px-3 text-xs font-mono text-primary transition-colors hover:border-[color:var(--realm-border-strong)] hover:bg-muted"
                  >
                    {formatAddress(address)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-52 border-[color:var(--realm-border-etched)] bg-[color:var(--realm-surface-iron)]/95"
                >
                  <WalletBalances walletAddress={address} />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/profile/${address}`}>Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => disconnect()}
                    disabled={isBusy}
                  >
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <WalletConnectButton className="min-h-11 px-3" />
              )}
            </div>
          </div>
        </div>
      </div>


    </header>
  );
}
