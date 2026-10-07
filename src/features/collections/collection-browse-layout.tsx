"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
export function CollectionBrowseLayout({
  filters,
  activeCount,
  children,
}: {
  filters: ReactNode;
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-4 xl:grid-cols-[208px_minmax(0,1fr)]">
      <div className="xl:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="min-h-11">
              Filters{activeCount ? ` (${activeCount})` : ""}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[min(90vw,360px)] gap-4 overflow-y-auto p-4"
          >
            <SheetHeader className="p-0">
              <SheetTitle>Filter items</SheetTitle>
              <SheetDescription>
                Choose traits, then show matching NFTs.
              </SheetDescription>
            </SheetHeader>
            {filters}
            <Button onClick={() => setOpen(false)}>Show results</Button>
          </SheetContent>
        </Sheet>
      </div>
      <aside
        className="hidden self-start xl:sticky xl:top-36 xl:block xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto"
        data-testid="trait-sidebar-container"
      >
        {filters}
      </aside>
      <div
        className="min-w-0 space-y-4"
        data-testid="collection-content-container"
      >
        {children}
      </div>
    </div>
  );
}
