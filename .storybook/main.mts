import type { StorybookConfig } from "@storybook/nextjs-vite";
import { fileURLToPath } from "node:url";
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  staticDirs: ["../public"],
  framework: "@storybook/nextjs-vite",
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  core: { disableTelemetry: true },
  async viteFinal(config) {
    // Discover the docs theme before browser tests start; a late Vite optimization reloads tests.
    config.optimizeDeps = {
      ...config.optimizeDeps,
      include: [
        ...(config.optimizeDeps?.include ?? []),
        "storybook/theming/create",
      ],
    };
    const existing = config.resolve?.alias ?? [];
    // These aliases exist only in Storybook and its browser tests. No real wallet or RPC is loaded.
    config.resolve = {
      ...config.resolve,
      alias: [
        {
          find: "@starknet-react/core",
          replacement: local("./mocks/wallet.ts"),
        },
        {
          find: "@/lib/marketplace/use-trade",
          replacement: local("./mocks/trade.ts"),
        },
        {
          find: "@/lib/marketplace/api-client",
          replacement: local("./mocks/api.ts"),
        },
        ...(Array.isArray(existing)
          ? existing
          : Object.entries(existing).map(([find, replacement]) => ({
              find,
              replacement,
            }))),
        { find: "@", replacement: local("../src") },
      ],
    };
    return config;
  },
};
export default config;
