"use client";
import { useState } from "react";
import { useWalletSession } from "@/lib/marketplace/use-wallet-session";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function ReportToken({
  collection,
  tokenId,
}: {
  collection: string;
  tokenId?: string;
}) {
  const session = useWalletSession();
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  async function report() {
    if (sending) return;
    setSending(true);
    setMessage("");
    try {
      await marketplaceRequest("/reports", {}, { collection, tokenId, reason });
      setMessage("Report submitted for review.");
      setReason("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to report.");
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="space-y-2 text-sm">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        Report this item
      </Button>
      {open && (
        <div className="space-y-2 rounded-md border p-3">
          {!session.verified ? (
            <Button
              disabled={session.busy}
              onClick={() => void session.login()}
            >
              Verify wallet to report
            </Button>
          ) : (
            <>
              <Input
                aria-label="Report reason"
                placeholder="Describe the issue"
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                disabled={sending || reason.trim().length < 5}
                onClick={() => void report()}
              >
                {sending ? "Sending report…" : "Submit report"}
              </Button>
            </>
          )}
          <p role="status">{message || session.error}</p>
        </div>
      )}
    </div>
  );
}
