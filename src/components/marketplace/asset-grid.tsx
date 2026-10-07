import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Size cards against available content width, including when sidebars are open. */
export function AssetGrid({
  density = "compact",
  className,
  ...props
}: ComponentProps<"div"> & { density?: "compact" | "dense" }) {
  return (
    <div
      className={cn(
        "market-asset-grid",
        density === "dense" && "market-asset-grid-dense",
        className,
      )}
      {...props}
    />
  );
}
