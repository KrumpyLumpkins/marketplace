import { expect } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
function Foundations() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4">
      <header>
        <Badge variant="outline">Current UI inventory</Badge>
        <h1 className="realm-title mt-4 text-4xl">Realms Marketplace</h1>
        <p className="mt-2 text-muted-foreground">
          The existing visual language, ready for brand review.
        </p>
      </header>
      <section aria-label="Color roles" className="grid gap-3 sm:grid-cols-3">
        {[
          ["Background", "--background"],
          ["Surface", "--card"],
          ["Primary · brass", "--primary"],
          ["Muted surface", "--muted"],
          ["Accent", "--accent"],
          ["Destructive", "--destructive"],
        ].map(([name, token]) => (
          <Card key={token}>
            <div
              className="h-20 rounded-t-lg border-b"
              style={{ background: `var(${token})` }}
            />
            <CardContent className="p-4">
              <p className="font-medium">{name}</p>
              <code className="text-xs text-muted-foreground">{token}</code>
            </CardContent>
          </Card>
        ))}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="realm-title text-3xl">IM Fell English SC · titles</p>
          <p className="font-sans text-base">
            Exo 2 · interface text, labels and descriptions.
          </p>
          <p className="font-mono text-sm">
            Geist Mono · 0x0123…abcd · 12.345 STRK
          </p>
          <p className="text-sm text-muted-foreground">
            Spacing, border radius and semantic colors come directly from
            globals.css.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
const meta = {
  title: "Foundations/Theme",
  component: Foundations,
  parameters: { layout: "fullscreen" },
  play: async ({ canvas }) => {
    await expect(
      getComputedStyle(
        canvas.getByText("Exo 2 · interface text, labels and descriptions."),
      ).fontFamily,
    ).toContain("Exo");
    await expect(
      getComputedStyle(
        canvas.getByText("Geist Mono · 0x0123…abcd · 12.345 STRK"),
      ).fontFamily,
    ).toContain("Geist");
    await expect(
      getComputedStyle(
        canvas.getByRole("heading", { name: "Realms Marketplace" }),
      ).fontFamily,
    ).toContain("IM Fell English SC");
  },
} satisfies Meta<typeof Foundations>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentTheme: Story = {};
export const LightReview: Story = { globals: { theme: "light" } };
