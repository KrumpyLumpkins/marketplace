import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TradeStatus } from "./trade-status";
const meta = {
  title: "Trading/Transaction feedback",
  component: TradeStatus,
  args: {
    state: {
      stage: "submitted",
      message: "Transaction submitted. Waiting for acceptance…",
      hash: "0x0123456789abcdef",
    },
  },
} satisfies Meta<typeof TradeStatus>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Submitted: Story = {};
export const Indexing: Story = {
  args: {
    state: {
      stage: "indexing",
      message: "Accepted on-chain. Waiting for marketplace data…",
      hash: "0x0123456789abcdef",
    },
  },
};
export const Reverted: Story = {
  args: {
    state: {
      stage: "reverted",
      message:
        "Transaction reverted. No trades completed; review the order before retrying.",
      hash: "0x0123456789abcdef",
    },
  },
};
export const Recovery: Story = {
  args: {
    state: {
      stage: "accepted",
      message:
        "Trade accepted. Indexing is delayed; check status instead of submitting again.",
      hash: "0x0123456789abcdef",
    },
  },
};
