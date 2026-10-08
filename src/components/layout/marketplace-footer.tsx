import Link from "next/link";
export function MarketplaceFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 border-t px-4 py-6 text-xs text-muted-foreground sm:px-6">
      <span>Realms Market</span>
      <nav aria-label="Community and support" className="flex flex-wrap gap-x-4 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:hover:text-foreground">
        <a
          href="https://x.com/LootRealms"
          target="_blank"
          rel="noopener noreferrer"
        >
          X / Twitter
        </a>
        <a
          href="https://discord.gg/realmsworld"
          target="_blank"
          rel="noopener noreferrer"
        >
          Discord
        </a>
        <a
          href="https://github.com/BibliothecaDAO"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <Link href="/ops">Market status</Link>
      </nav>
    </footer>
  );
}
