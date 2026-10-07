"use client";
import { useState, type ReactNode } from "react";
import { useConnect } from "@starknet-react/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
function connectorLabel(connector: { id: string; name?: string }) {
  if (connector.name && connector.name.trim().length > 0) {
    return connector.name;
  }

  return connector.id;
}

function connectorIconUrl(connector: { icon?: unknown }) {
  return typeof connector.icon === "string" && connector.icon.trim().length > 0
    ? connector.icon
    : null;
}

export function WalletConnectButton({
  children = "Connect Wallet",
  className,
  disabled = false,
}: {
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { connectAsync, connectors, isPending: isConnecting } = useConnect();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [connectionPending, setConnectionPending] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const isBusy = isConnecting || connectionPending;
  const handleConnect = async (connector: (typeof connectors)[number]) => {
    if (isBusy) return;
    setConnectionError("");
    setConnectionPending(true);
    try {
      if (connector.available && !connector.available()) {
        throw new Error(
          `${connectorLabel(connector)} was not detected. Open this site in a browser with that wallet enabled, or choose another wallet.`,
        );
      }
      await connectAsync({ connector });
      setWalletModalOpen(false);
    } catch (error) {
      setConnectionError(
        error instanceof Error
          ? error.message
          : "Connection failed. Please try again.",
      );
    } finally {
      setConnectionPending(false);
    }
  };

  return (
    <Dialog
      open={walletModalOpen}
      onOpenChange={(open) => {
        if (!isBusy) {
          setWalletModalOpen(open);
          if (open) setConnectionError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          className={className}
          disabled={disabled || isBusy}
        >
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!isBusy}>
        <DialogHeader>
          <DialogTitle className="realm-title text-xl">
            SELECT WALLET
          </DialogTitle>
          <DialogDescription>
            Choose a wallet connector to continue.
          </DialogDescription>
        </DialogHeader>
        {connectionError && (
          <p role="alert" className="text-sm text-destructive">
            {connectionError}
          </p>
        )}
        {connectionPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Confirm the connection in your wallet…
          </p>
        )}
        <div className="space-y-2">
          {connectors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No wallet connectors are available.
            </p>
          ) : (
            connectors.map((connector) => (
              <Button
                key={connector.id}
                className="w-full justify-start gap-2"
                disabled={isBusy}
                onClick={() => {
                  void handleConnect(connector);
                }}
                type="button"
                variant="outline"
              >
                {connectorIconUrl(connector) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={connectorIconUrl(connector)!}
                    alt={`${connectorLabel(connector)} icon`}
                    className="h-5 w-5"
                  />
                ) : null}
                {connectorLabel(connector)}
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
