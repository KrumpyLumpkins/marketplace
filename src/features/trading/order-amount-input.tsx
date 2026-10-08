"use client";
import { useId } from "react";
import { Coins } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
export function OrderAmountInput({
  value,
  onChange,
  onBlur,
  currency,
  onCurrencyChange,
  currencies,
  error,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  currency: string;
  onCurrencyChange: (value: string) => void;
  currencies: Array<{ address: string; symbol: string; decimals: number }>;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          Price
        </label>
        <span className="text-xs text-muted-foreground">Per NFT</span>
      </div>
      <div
        className={cn(
          "flex min-w-0 items-center gap-3 rounded-xl border border-[color:var(--realm-border-etched)] bg-muted/20 px-4 py-2 transition-[border-color,box-shadow] focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/15",
          error &&
            "border-destructive/60 focus-within:border-destructive focus-within:ring-destructive/15",
          disabled && "opacity-60",
        )}
      >
        {/* Decimal text input preserves token precision beyond JavaScript numbers. */}
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="0.00"
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-16 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-3xl font-medium tabular-nums tracking-tight shadow-none placeholder:text-muted-foreground/40 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent md:text-3xl"
        />
        <Select
          value={currency}
          onValueChange={onCurrencyChange}
          disabled={disabled || !currencies.length}
        >
          <SelectTrigger
            aria-label="Currency"
            className="h-12 min-h-12 w-32 shrink-0 gap-2 rounded-lg border-border/70 bg-background/70 px-3 font-semibold shadow-none"
          >
            <Coins aria-hidden className="size-4 shrink-0 text-primary" />
            <SelectValue placeholder="Token" />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c) => (
              <SelectItem key={c.address} value={c.address}>
                {c.symbol}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
