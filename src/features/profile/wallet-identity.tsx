"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function WalletIdentity({
  address,
  connected = false,
  label,
}: {
  address: string;
  connected?: boolean;
  label?: string;
}) {
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {label ?? "Wallet address"}
        {connected ? " · Your connected wallet" : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all rounded border p-2 text-xs" title={address}>
          {address.length > 14
            ? `${address.slice(0, 6)}…${address.slice(-4)}`
            : address}
        </code>
        <Button
          size="sm"
          variant="outline"
          aria-label="Copy address"
          onClick={() =>
            void navigator.clipboard.writeText(address).then(
              () => setMessage("Address copied"),
              () => setMessage(`Unable to copy. Wallet address: ${address}`),
            )
          }
        >
          Copy
        </Button>
      </div>
      <p role="status" className="break-all text-xs">
        {message}
      </p>
    </div>
  );
}
