import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { Button } from "./button";
const meta = {
  title: "UI/Button",
  component: Button,
  args: { children: "Continue", onClick: fn() },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "secondary",
        "outline",
        "ghost",
        "link",
        "destructive",
      ],
    },
    size: { control: "select", options: ["default", "sm", "lg", "xs"] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Primary: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
export const KeyboardActivation: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("button")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("button")).toBeDisabled();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {(
        [
          "default",
          "secondary",
          "outline",
          "ghost",
          "link",
          "destructive",
        ] as const
      ).map((variant) => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};
