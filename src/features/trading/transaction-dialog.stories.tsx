import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, waitFor } from "storybook/test";
import { TransactionDialog } from "./transaction-dialog";
const hash =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const meta = {
  title: "Trading/Transaction modal",
  component: TransactionDialog,
  args: {
    open: true,
    busy: true,
    chain: "SN_MAIN",
    onClose: fn(),
    onCheck: fn(),
    state: {
      stage: "signature",
      message: "Confirm this transaction in your wallet.",
    },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TransactionDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WalletApproval: Story = {
  play: async ({ canvasElement, userEvent, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(body.getByRole("dialog")).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};
export const Preparing: Story = {
  args: {
    state: {
      stage: "checking",
      message: "Checking order terms and approvals…",
    },
  },
};
export const Submitted: Story = {
  args: {
    state: {
      stage: "submitted",
      hash,
      message: "Transaction submitted. Waiting for acceptance…",
    },
  },
};
export const UpdatingMarketplace: Story = {
  args: {
    state: {
      stage: "indexing",
      hash,
      message: "Accepted on-chain. Waiting for marketplace data…",
    },
  },
};
export const IndexingDelayed: Story = {
  args: {
    busy: false,
    state: {
      stage: "accepted",
      hash,
      message:
        "Trade accepted. Indexing is delayed; check status instead of submitting again.",
    },
  },
  play: async ({ canvasElement, userEvent, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("button", { name: "Check status" }));
    await expect(args.onCheck).toHaveBeenCalledOnce();
    await expect(
      body.getByRole("link", { name: "View transaction" }),
    ).toHaveAttribute("href", `https://starkscan.co/tx/${hash}`);
  },
};
export const Complete: Story = {
  args: {
    busy: false,
    state: {
      stage: "reflected",
      hash,
      message: "Trade confirmed and marketplace updated.",
    },
  },
  play: async ({ canvasElement, userEvent, args }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", {
        name: "Done",
      }),
    );
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
export const WalletRejected: Story = {
  args: {
    busy: false,
    state: {
      stage: "error",
      message: "Transaction rejected in wallet. No trade was submitted.",
    },
  },
};
export const Reverted: Story = {
  args: {
    busy: false,
    state: {
      stage: "reverted",
      hash,
      message:
        "Transaction reverted. No trades completed; review the order before retrying.",
    },
  },
};
export const Unknown: Story = {
  args: {
    busy: false,
    state: {
      stage: "error",
      unknownSubmission: true,
      message:
        "Submission outcome is unknown. Check your wallet activity before trying again.",
    },
  },
};
