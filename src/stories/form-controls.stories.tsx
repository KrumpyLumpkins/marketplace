import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
function FormControls() {
  const [price, setPrice] = useState(""),
    [enabled, setEnabled] = useState(false),
    [currency, setCurrency] = useState("STRK");
  return (
    <form
      aria-label="Listing preferences"
      className="max-w-sm space-y-5"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="space-y-2">
        <label htmlFor="story-price" className="text-sm">
          Price
        </label>
        <Input
          id="story-price"
          inputMode="decimal"
          placeholder="0.00"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="story-currency" className="text-sm">
          Currency
        </label>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger id="story-currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STRK">STRK</SelectItem>
            <SelectItem value="LORDS">LORDS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="story-notify"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <label htmlFor="story-notify">Notify me about offers</label>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {price || "0"} {currency} · notifications {enabled ? "on" : "off"}
      </p>
    </form>
  );
}
const meta = {
  title: "UI/Form controls",
  component: FormControls,
} satisfies Meta<typeof FormControls>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const EditPreferences: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "2.75");
    await userEvent.click(canvas.getByRole("combobox"));
    const document = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await document.findByRole("option", { name: "LORDS" }),
    );
    await userEvent.click(canvas.getByRole("switch"));
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "2.75 LORDS · notifications on",
    );
  },
};
export const KeyboardToggle: Story = {
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole("switch").focus();
    await userEvent.keyboard(" ");
    await expect(canvas.getByRole("switch")).toBeChecked();
  },
};
