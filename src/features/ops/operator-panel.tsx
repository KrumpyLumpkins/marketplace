"use client";
import { useState } from "react";
import { ListSkeleton } from "@/components/marketplace/loading-state";

import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Report = {
  id: string;
  account: string;
  status: string;
  body: { collection: string; tokenId?: string; reason: string };
};
export function OperatorPanel() {
  const [busy, setBusy] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [key, setKey] = useState(""),
    [reports, setReports] = useState<Report[]>([]),
    [message, setMessage] = useState("");
  const [collection, setCollection] = useState(""),
    [reason, setReason] = useState("");
  async function change(body: Record<string, unknown>) {
    try {
      await operator("collections", { address: collection, ...body });
      setMessage("Collection policy updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    }
  }
  async function operator(path: string, body?: unknown) {
    setBusy(true);
    try {
      const chain = getMarketplaceRuntimeConfig().chainLabel;
      const response = await fetch(
        `/api/marketplace/v1/chains/${chain}/operator/${path}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            authorization: `Bearer ${key}`,
            ...(body ? { "content-type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error?.message ?? "Operator request failed.");
      return json.data;
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    setLoadingReports(true);
    try {
      setReports(await operator("reports"));
      setMessage("Reports loaded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoadingReports(false);
    }
  }
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Operator reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            aria-label="Operator access token"
            placeholder="Operator access token"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
          <Button disabled={!key} onClick={() => void load()}>
            Load reports
          </Button>
          <p role="status" className="text-sm">
            {busy ? "Working…" : message}
          </p>
          {loadingReports && reports.length === 0 && (
            <ListSkeleton label="Loading reports" compact />
          )}
          <div className="space-y-2 rounded border p-3">
            <h3 className="font-medium">Registered collection controls</h3>
            <Input
              aria-label="Collection contract"
              placeholder="Collection contract address"
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
            />
            <Input
              aria-label="Moderation reason"
              placeholder="Reason for content decision"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!key || !collection}
                onClick={() => void change({ verified: true })}
              >
                Mark verified
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!key || !collection}
                onClick={() => void change({ verified: false })}
              >
                Remove verification
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!key || !collection || !reason}
                onClick={() => void change({ hidden: true, reason })}
              >
                Restrict content
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!key || !collection}
                onClick={() => void change({ hidden: false, reason })}
              >
                Restore content
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!key || !collection}
                onClick={() =>
                  void operator("metadata", { collection })
                    .then(() => setMessage("Metadata refresh queued."))
                    .catch((e) => setMessage(e.message))
                }
              >
                Refresh metadata
              </Button>
            </div>
          </div>
          {reports.map((r) => (
            <div key={r.id} className="space-y-2 rounded border p-3 text-sm">
              <p>{r.body.reason}</p>
              <p className="break-all text-xs text-muted-foreground">
                {r.body.collection} · {r.status}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void operator("reports", { id: r.id, status: "resolved" })
                      .then(load)
                      .catch((e) => setMessage(e.message))
                  }
                >
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void operator("collections", {
                      address: r.body.collection,
                      hidden: true,
                      reason: r.body.reason,
                    })
                      .then(() =>
                        setMessage("Collection hidden pending review."),
                      )
                      .catch((e) => setMessage(e.message))
                  }
                >
                  Hide collection
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </fieldset>
  );
}
