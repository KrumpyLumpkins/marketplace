import Link from "next/link";
import { ECOSYSTEM_LINKS, SOCIAL_LINKS } from "./social-icons";

export function MarketplaceFooter() {
  return (
    <footer className="border-t border-[color:var(--realm-border-etched)] px-4 py-8 text-xs text-muted-foreground sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/realms-mark.svg" alt="" className="size-8 opacity-80" />
          <div>
            <p className="realm-title text-sm text-[color:var(--realm-title)]">Realms Market</p>
            <p>Part of the Realms.World ecosystem.</p>
          </div>
        </div>
        <nav aria-label="Realms.World" className="flex flex-wrap gap-x-4 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:hover:text-foreground">
          {ECOSYSTEM_LINKS.filter((link) => link.external).map((link) => (
            <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Community and support" className="flex flex-wrap gap-x-4 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:gap-1.5 [&_a]:hover:text-foreground">
          {SOCIAL_LINKS.map(({ label, href, Icon, iconClassName }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer">
              <Icon className={iconClassName} />
              {label}
            </a>
          ))}
          <Link href="/ops">Market status</Link>
        </nav>
      </div>
    </footer>
  );
}
