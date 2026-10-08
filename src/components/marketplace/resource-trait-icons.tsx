"use client";

import { ResourceIcon, resolveResourceIcon } from "@/components/marketplace/resource-icon";
import { cn } from "@/lib/utils";

type ResourceTraitIconsProps = {
  resources: string[];
  /** Show the resource name beside each icon (list and detail layouts). */
  showLabels?: boolean;
  /** Icon size in pixels. */
  size?: number;
  /** Collapse the tail into a "+N" count after this many icons. */
  max?: number;
  className?: string;
};

/**
 * Realm resources rendered with the in-game artwork. Icons carry their name as
 * alt text and a native tooltip, so the list stays readable without hover.
 */
export function ResourceTraitIcons({
  resources,
  showLabels = false,
  size = showLabels ? 18 : 20,
  max,
  className,
}: ResourceTraitIconsProps) {
  if (resources.length === 0) {
    return null;
  }

  const visible = max && resources.length > max ? resources.slice(0, max) : resources;
  const hidden = resources.length - visible.length;

  return (
    <ul
      className={cn("flex flex-wrap items-center gap-1", className)}
      data-testid="resource-trait-icons"
      aria-label="Resources"
    >
      {visible.map((resource) => {
        const label = resolveResourceIcon(resource)?.label ?? resource;
        return (
          <li
            key={resource}
            title={label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] border border-[color:var(--realm-border-etched)] bg-[color:var(--realm-bg-void)]/60 text-[11px] text-[color:var(--realm-text-muted)]",
              showLabels ? "px-1.5 py-0.5" : "p-0.5",
            )}
          >
            <ResourceIcon name={resource} size={size} decorative={showLabels} />
            {showLabels ? <span>{label}</span> : null}
          </li>
        );
      })}
      {hidden > 0 ? (
        <li
          className="inline-flex items-center rounded-[6px] border border-[color:var(--realm-border-etched)] px-1.5 py-0.5 text-[11px] text-muted-foreground"
          title={resources.slice(visible.length).join(", ")}
        >
          +{hidden}
          <span className="sr-only"> more: {resources.slice(visible.length).join(", ")}</span>
        </li>
      ) : null}
    </ul>
  );
}
