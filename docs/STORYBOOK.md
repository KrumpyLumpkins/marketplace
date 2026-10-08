# Storybook component workbench

Storybook is the place to inspect the existing brand implementation and verify component interactions in isolation. It uses the production Next.js components, Tailwind v4 CSS, local assets and shared font configuration. The current foundation stories are an inventory, not a newly approved brand guideline.

## Run and test

Use the repository's Node 22.22 / pnpm 10.8.1 toolchain.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm storybook
```

Open `http://localhost:6006`. The marketplace API and a wallet extension are not required.

```sh
pnpm storybook:test        # Chromium play functions and accessibility checks
pnpm storybook:test:watch  # Watch component interactions while editing
pnpm storybook:build       # Portable static site in storybook-static/
pnpm test                 # Existing jsdom unit/integration project
pnpm test:coverage        # Combined unit + real-browser coverage, unchanged 70% gates
```

Storybook 10.6.1 uses the Next.js/Vite framework and Vitest 4.1.11 browser integration. The two Vitest projects are named `unit` and `storybook`. Accessibility uses `a11y.test: 'error'`, so violations fail tests. This was verified with a temporary unnamed-button story, which failed the button-name rule and was removed.

CI installs Chromium before coverage, runs both projects, builds Storybook, and uploads its static output as a seven-day artifact. No paid service, external publication or new backend runtime dependency is required.

When a compatible Chromium is already installed locally, set `CHROMIUM_EXECUTABLE_PATH` to its executable for `storybook:test`, `test:coverage` or `test:e2e`. Omitting it uses the pinned Playwright browser, as in CI.

## Catalog

- **Foundations:** current palette, surfaces, typography and dark/light review.
- **UI:** button variants, disabled and keyboard states; form input/select/switch; confirmation-dialog focus and dismissal; tab navigation.
- **Wallet:** disconnected/connected header, connect/disconnect, rejection, missing extension and pending approval.
- **Marketplace UX:** responsive header, wallet entry points, currency-labelled prices, mobile filters, collapsible statistics, single purchase action, activity provenance, public status and wallet identity.
- **Trading:** cart contents, disabled checkout, removal, invalid listing, wallet rejection and success; offer proceeds confirmation; listing/token/collection offers and repricing; funded/empty/partial/unavailable bids; transaction status and delayed indexing.

Use the Interactions panel to step through a story's play function, the Accessibility panel to inspect findings, and the viewport/theme controls for visual review. Automated accessibility is a useful gate, not a complete manual accessibility review.

## Add a story

Place `component.stories.tsx` alongside the production component and use typed Component Story Format:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Continue', onClick: fn() },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Activate: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
```

Assert observable behavior: visible errors, disabled controls, exact displayed amounts, focus, retained input and callbacks. Use `findByRole` for asynchronously added content and `waitFor` for transitions/focus restoration; do not add arbitrary sleeps. Query portalled dialogs and menus through `within(canvasElement.ownerDocument.body)`. Browser story files run serially to keep keyboard/focus checks stable.

## Fixture boundary

`.storybook/main.mts` replaces only wallet hooks, `useTrade` and the marketplace API module inside the Storybook builder. Application builds and unit tests keep the real modules. The actual header, form components, order calldata helpers, cart and status components still run.

`.storybook/scenario.ts` defines named outcomes. Set them in a story's `beforeEach`, after the global reset. `.storybook/mocks/` contains observable mock functions and explicit API responses. Unknown API paths throw instead of falling through to live services. The preview provides a fresh React Query client, resets cart/currency/scenario state, and renders docs examples in separate iframes to avoid state leaking between examples.

The signing mock records calls without contacting a wallet or chain. These stories establish UI behavior; contract settlement, wallet compatibility and actual network switching remain covered by separate unit/devnet/browser-wallet validation. The existing owned-data integration tests exercise the real React Query/API adapters so fixtures are not the sole evidence for data wiring.

## Visual foundations

- Production tokens and typography rules: `src/app/globals.css`.
- Shared Next.js font loaders and semantic font bindings: `src/lib/fonts.ts` (used by the app layout and preview). Typography stories verify Exo 2, Geist Mono and the local display face.
- Current local imagery and logo: `public/`.
- Storybook manager/docs chrome: `.storybook/theme.ts`.

Keep app tokens authoritative. Change brand choices through a separate, reviewed brand-guideline task; do not quietly redesign production colors to make a story pass. Use real components rather than duplicated mock screens.

## Coverage boundaries and next work

The catalog is a starting set, not exhaustive verification of all marketplace journeys. Add authenticated inbox/report/moderation, dashboard pagination, wallet network changes, recovery/retry and mobile-specific states as those components are developed. Before calling a workflow verified, distinguish a simulated story, a full-app browser test and a real signed transaction.

Coverage combines unit and browser tests. The upgrade from Vitest 2 changed coverage accounting; the 70% thresholds remain unchanged. Story files, fixture wrappers and font-loader configuration are excluded from application coverage; production interaction code remains included.

References: [Next.js/Vite framework](https://storybook.js.org/docs/get-started/frameworks/nextjs-vite), [Vitest integration](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon), [interaction testing](https://storybook.js.org/docs/writing-tests/interaction-testing).

## Marketplace spacing

Use `.market-page` for one page-level inset: 16px below 640px, 24px above.
Do not add a second page gutter inside a route wrapper. Collection banners bleed
through that inset; their minimum height is 128px on mobile and 160px above 640px,
and long titles can grow the banner rather than overlap its statistics.

Use 16px between collection sections, 12px between assets, 12px for card text
insets and 8px for card action insets. `AssetGrid` sizes columns from available
content width: 192px minimum in compact mode and 160px in dense mode, with two
columns on phones. Keep media aspect ratios collection-specific. Asset action
buttons retain 44px touch targets and wrap when their labels need more room.

`Marketplace/Asset layout` → `Comfortable` and `Dense` exercise real cards,
the collection banner and filter layout, including long names, missing artwork
and unlisted assets. The spacing pass checked 320, 390, 639, 640, 768, 1024,
1279, 1280, 1440 and 1920px, including button clipping, focus and overflow.

## Collection discovery without a navigation rail

`Marketplace/Full width navigation` → `Collection` and `Mobile` compose the
production header, server-renderable page shell, trait filters and asset cards.
The header's Collections link goes to `/#collections`; global search remains
available beside it. Collection-specific traits remain in the browsing view.
The global shell must not mount collection-list queries or thumbnail fallbacks.
The removed desktop collection rail and mobile collection drawer should not be
reintroduced as a second navigation system.

Reference: [OpenSea's collection page](https://opensea.io/collection/azuki),
inspected 7 October 2026. OpenSea currently separates compact global navigation
and search from collection-specific filters. Our implementation removes the
collection rail completely while retaining the existing Realms branding.

## Unknown submission recovery

`Trading/Unknown submission recovery` covers verified-hash confirmation,
wallet-confirmed non-submission, lookup failure, busy and mobile states.
`Trading/Saved transaction toolbar` verifies that the real toolbar exposes the
same component and hides it after successful reconciliation without signing.
The form was checked at 320, 768 and 1440px, including keyboard checkbox operation,
wrapped buttons and retained input after errors. Hash recovery checks the current
chain, transaction hash and wallet sender; the user must confirm that the hash
belongs to the attempted action. Non-submission requires explicit wallet confirmation;
recovery never automatically replays a trade. Real wallet-provider rehearsal remains
separate from these component and adapter tests.

## Offer review and transaction feedback

`Marketplace/Asset offers` covers populated, owner, empty, loading, failed,
paginated and long-value layouts. The multiple-offer review story uses the actual
acceptance component and checks that only one transaction dialog appears without
moving the offer list.

`Trading/Transaction modal` covers preparation, wallet approval, submission,
index updates, delayed indexing, completion, rejection, reversion and unknown
submission. `Trading/Order composer` checks that content below the form stays in
place while the modal is open, preserves entered terms after rejection, and checks
keyboard focus after dismissal. `Trading/Offer review` verifies the proceeds/fee
breakdown and focus after the review-to-transaction handoff.

The toolbar owns one `TransactionFeedback` instance. Trade controls must not mount
additional transaction dialogs or inline copies of the shared transaction state.
The active dialog remains open while the coordinator is busy. When tracking stops,
it can be dismissed and reopened from the toolbar; delayed transactions expose a
read-only status check. Dismissal never clears or resubmits a saved transaction.
These stories simulate wallet responses; they do not sign real transactions.

`Trading/Price input` checks decimal entry without floating-point conversion,
currency switching, long values, validation and disabled states. The Realms
composer has no editable royalty cap: new orders submit a zero cap and show a
fixed 0% creator royalty beside the configured marketplace fee and seller proceeds.

Exo 2 and Geist Mono are bundled under `public/brand/fonts` with their OFL licenses.
This removes the Google font-service dependency from production builds. The preview
uses the same font files through public URLs because its local-font adapter emits
invalid unquoted filesystem URLs when the workspace path contains spaces. Font
stories verify that the declared faces load rather than silently using a fallback.
