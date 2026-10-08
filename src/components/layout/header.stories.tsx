import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, waitFor } from "storybook/test";
import { Header } from "./header";
import { useScenario } from "../../../.storybook/scenario";
const meta = {
  title: "Wallet/Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Production header with simulated wallet adapters. No extension, login, or transaction is requested.",
      },
    },
  },
} satisfies Meta<typeof Header>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Disconnected: Story = {};
export const Connected: Story = {
  beforeEach() {
    useScenario.setState({ connected: true });
  },
};
export const ConnectAndDisconnect: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const document = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Connect Wallet" }),
    );
    await userEvent.click(
      await document.findByRole("button", { name: "Controller" }),
    );
    await expect(await canvas.findByTestId("wallet-address")).toBeVisible();
    await waitFor(() => {
      expect(document.queryByRole("dialog")).not.toBeInTheDocument();
      expect(canvasElement.ownerDocument.body).not.toHaveStyle({
        pointerEvents: "none",
      });
    });
    await userEvent.click(canvas.getByTestId("wallet-address"));
    await userEvent.click(
      await document.findByRole("menuitem", { name: "Disconnect" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Connect Wallet" }),
    ).toBeVisible();
  },
};
export const RejectedConnection: Story = {
  beforeEach() {
    useScenario.setState({ walletOutcome: "rejected" });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const document = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByText("Connect Wallet"));
    await userEvent.click(
      await document.findByRole("button", { name: "Controller" }),
    );
    await expect(await document.findByRole("alert")).toHaveTextContent(
      "Connection rejected",
    );
    await expect(document.getByRole("dialog")).toBeVisible();
  },
};
export const MissingExtension: Story = {
  beforeEach() {
    useScenario.setState({ walletOutcome: "missing" });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const document = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByText("Connect Wallet"));
    await userEvent.click(
      await document.findByRole("button", { name: "Braavos" }),
    );
    await expect(await document.findByRole("alert")).toHaveTextContent(
      "was not detected",
    );
  },
};
export const AwaitingApproval: Story = {
  beforeEach() {
    useScenario.setState({ walletOutcome: "pending" });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const document = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByText("Connect Wallet"));
    await userEvent.click(
      await document.findByRole("button", { name: "Controller" }),
    );
    await expect(await document.findByRole("status")).toHaveTextContent(
      "Confirm the connection",
    );
    await expect(
      document.getByRole("button", { name: "Controller" }),
    ).toBeDisabled();
  },
};

export const MobileNavigation: Story = {
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open navigation menu" }),
    );
    const menu = await body.findByRole("dialog", { name: "Marketplace menu" });
    await waitFor(() => expect(menu).toBeVisible());
    expect(within(menu).getByRole("link", { name: "Portfolio" })).toBeVisible();
    expect(
      within(menu).getByRole("button", { name: "Connect Wallet" }),
    ).toBeVisible();
    await waitFor(() => expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth,
    ));
  },
};
