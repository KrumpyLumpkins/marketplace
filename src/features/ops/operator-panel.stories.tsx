import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, spyOn } from "storybook/test";
import { OperatorPanel } from "./operator-panel";
const meta = {
  title: "Marketplace/Operator loading",
  component: OperatorPanel,
} satisfies Meta<typeof OperatorPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LoadingReports: Story = {
  beforeEach: () => {
    const original = globalThis.fetch.bind(globalThis);
    const request = spyOn(globalThis, "fetch").mockImplementation(
      (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        return url.includes("/operator/reports")
          ? new Promise(() => {})
          : original(input, init);
      },
    );
    return () => request.mockRestore();
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Operator access token"),
      "storybook-only",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Load reports" }));
    await expect(
      canvas.getByRole("status", { name: "Loading reports" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Load reports" }),
    ).toBeDisabled();
  },
};
