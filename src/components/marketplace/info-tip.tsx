"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type InfoTipProps = {
  /** Plain-language explanation shown on hover and focus. */
  text: string;
  /** Accessible name for the trigger button. Defaults to "More information". */
  label?: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
};

/** A small, keyboard-reachable explainer. The text is also exposed as the button's description. */
export function InfoTip({ text, label = "More information", className, side = "top" }: InfoTipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Info aria-hidden className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side}>{text}</TooltipContent>
    </Tooltip>
  );
}
