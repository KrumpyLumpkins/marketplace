import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { createMarketplaceClient } from "@biblio/marketplace";
import {
  MarketplaceProvider,
  useMarketplaceQuery,
  useContractConfig,
} from "../dist/index.js";
test("React consumer reads the SDK TanStack cache through exported hooks", async () => {
  const client = createMarketplaceClient({
    apiUrl: "https://indexer.example",
    chain: "LOCAL",
    chainId: "0x1",
    fetch: async () =>
      new Response(JSON.stringify({ data: { name: "External collection" } })),
  });
  await client.request("/collections/0xa");
  function Consumer() {
    const q = useMarketplaceQuery("/collections/0xa");
    return React.createElement("p", null, q.data?.name ?? "Loading");
  }
  assert.match(
    renderToString(
      React.createElement(
        MarketplaceProvider,
        { client },
        React.createElement(Consumer),
      ),
    ),
    /External collection/,
  );
  client.dispose();
});
test("React bindings expose typed direct contract queries through the same SDK cache", async () => {
  const client = createMarketplaceClient({
    apiUrl: "https://offline.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
    contractReader: {
      getChainId: async () => "0x1",
      call: async () => ["1", "0x2", "1", "200", "0x4"],
    },
  });
  try {
    await client.contract.getConfig();
    function Status() {
      const query = useContractConfig();
      return React.createElement(
        "p",
        null,
        query.data?.paused ? "Paused" : "Loading",
      );
    }
    assert.match(
      renderToString(
        React.createElement(
          MarketplaceProvider,
          { client },
          React.createElement(Status),
        ),
      ),
      /Paused/,
    );
  } finally {
    client.dispose();
  }
});
test("contract quote hooks can stay disabled while form inputs are incomplete", async () => {
  const { useContractQuote } = await import("../dist/index.js");
  const client = createMarketplaceClient({
    apiUrl: "https://offline.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
  });
  try {
    function Form() {
      const query = useContractQuote("", "", "", { enabled: false });
      return React.createElement("p", null, query.fetchStatus);
    }
    assert.match(
      renderToString(
        React.createElement(
          MarketplaceProvider,
          { client },
          React.createElement(Form),
        ),
      ),
      /idle/,
    );
  } finally {
    client.dispose();
  }
});
