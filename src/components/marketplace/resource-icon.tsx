import { cn } from "@/lib/utils";

/**
 * Resource artwork mirrors the in-game Eternum catalogue
 * (`apps/game/public/images/resources/<id>.png` in BibliothecaDAO/eternum,
 * MIT). Files are keyed by the game's `ResourcesIds` enum names.
 */
export const RESOURCE_ICONS = {
  stone: { file: "stone", label: "Stone" },
  coal: { file: "coal", label: "Coal" },
  wood: { file: "wood", label: "Wood" },
  copper: { file: "copper", label: "Copper" },
  ironwood: { file: "ironwood", label: "Ironwood" },
  obsidian: { file: "obsidian", label: "Obsidian" },
  gold: { file: "gold", label: "Gold" },
  silver: { file: "silver", label: "Silver" },
  mithral: { file: "mithral", label: "Mithral" },
  alchemicalsilver: { file: "alchemical-silver", label: "Alchemical Silver" },
  coldiron: { file: "cold-iron", label: "Cold Iron" },
  deepcrystal: { file: "deep-crystal", label: "Deep Crystal" },
  ruby: { file: "ruby", label: "Ruby" },
  diamonds: { file: "diamonds", label: "Diamonds" },
  hartwood: { file: "hartwood", label: "Hartwood" },
  ignium: { file: "ignium", label: "Ignium" },
  twilightquartz: { file: "twilight-quartz", label: "Twilight Quartz" },
  trueice: { file: "true-ice", label: "True Ice" },
  adamantine: { file: "adamantine", label: "Adamantine" },
  sapphire: { file: "sapphire", label: "Sapphire" },
  etherealsilica: { file: "ethereal-silica", label: "Ethereal Silica" },
  dragonhide: { file: "dragonhide", label: "Dragonhide" },
  labor: { file: "labor", label: "Labor" },
  ancientfragment: { file: "ancient-fragment", label: "Ancient Fragment" },
  donkey: { file: "donkey", label: "Donkey" },
  knight: { file: "knight", label: "Knight" },
  knightt2: { file: "knight-t2", label: "Knight T2" },
  knightt3: { file: "knight-t3", label: "Knight T3" },
  crossbowman: { file: "crossbowman", label: "Crossbowman" },
  crossbowmant2: { file: "crossbowman-t2", label: "Crossbowman T2" },
  crossbowmant3: { file: "crossbowman-t3", label: "Crossbowman T3" },
  paladin: { file: "paladin", label: "Paladin" },
  paladint2: { file: "paladin-t2", label: "Paladin T2" },
  paladint3: { file: "paladin-t3", label: "Paladin T3" },
  wheat: { file: "wheat", label: "Wheat" },
  fish: { file: "fish", label: "Fish" },
  lords: { file: "lords", label: "Lords" },
  essence: { file: "essence", label: "Essence" },
} as const;

const ALIASES: Record<string, keyof typeof RESOURCE_ICONS> = {
  diamond: "diamonds",
  twilightquartz: "twilightquartz",
  quartz: "twilightquartz",
  ice: "trueice",
  silica: "etherealsilica",
  crystal: "deepcrystal",
};

export function normalizeResourceName(value: string) {
  return value.replace(/[\s_-]+/g, "").toLowerCase();
}

export function resolveResourceIcon(name: string) {
  const key = normalizeResourceName(name);
  const direct = RESOURCE_ICONS[key as keyof typeof RESOURCE_ICONS];
  if (direct) return direct;
  const alias = ALIASES[key];
  return alias ? RESOURCE_ICONS[alias] : null;
}

export function resourceIconSrc(name: string) {
  const icon = resolveResourceIcon(name);
  return icon ? `/resources/${icon.file}.png` : null;
}

type ResourceIconProps = {
  name: string;
  /** Rendered size in pixels; artwork is 96px, so keep this at or below 48. */
  size?: number;
  className?: string;
  /** Hide from assistive tech when a visible label sits beside the icon. */
  decorative?: boolean;
};

export function ResourceIcon({ name, size = 16, className, decorative = false }: ResourceIconProps) {
  const src = resourceIconSrc(name);
  if (!src) {
    return (
      <span
        aria-hidden={decorative || undefined}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : name}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-[4px] bg-muted font-semibold uppercase text-foreground",
          className,
        )}
        style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.5)) }}
      >
        {name.trim().slice(0, 1)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={decorative ? "" : name}
      aria-hidden={decorative || undefined}
      className={cn("shrink-0 object-contain", className)}
      decoding="async"
      height={size}
      loading="lazy"
      src={src}
      width={size}
    />
  );
}
