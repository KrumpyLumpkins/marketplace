import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, waitFor } from "storybook/test";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
function Confirmation() {
  const [open, setOpen] = useState(false),
    [cancelled, setCancelled] = useState(false);
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">Cancel listing</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this listing?</DialogTitle>
            <DialogDescription>
              Your NFT stays in your wallet. The listing will no longer be
              available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep listing</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setCancelled(true);
                setOpen(false);
              }}
            >
              Confirm cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {cancelled && (
        <p role="status" className="mt-4">
          Listing cancelled.
        </p>
      )}
    </>
  );
}
const meta = {
  title: "UI/Confirmation dialog",
  component: Confirmation,
} satisfies Meta<typeof Confirmation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Confirm: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const document = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByText("Cancel listing"));
    await waitFor(() => expect(document.getByRole("dialog")).toBeVisible());
    await userEvent.click(document.getByText("Confirm cancellation"));
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Listing cancelled.",
    );
  },
};
export const EscapeRestoresFocus: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByText("Cancel listing");
    await userEvent.click(trigger);
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog"),
      ).toBeVisible(),
    );
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("button", {
          name: "Keep listing",
        }),
      ).toHaveFocus(),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
  },
};
