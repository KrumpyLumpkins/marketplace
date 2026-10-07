export const artifacts = {
  classHash: "0x123",
  compiledClassHash: "0x456",
  sourceSha256: "a".repeat(64),
  abiSha256: "b".repeat(64),
  scarb: "2.15.1",
};
export const input = () => ({
  schemaVersion: 1,
  network: "SN_SEPOLIA",
  deployer: "0x1",
  deployerClassHash: "0x11",
  administrator: "0x2",
  administratorClassHash: "0x22",
  feeRecipient: "0x3",
  feeBps: 200,
  salt: "0x4",
  udc: { address: "0x5", classHash: "0x55" },
  maxFeeFri: "1000000",
  collections: [
    {
      address: "0x6",
      classHash: "0x66",
      name: "Fixture",
      startBlock: 0,
      royalties: true,
      review: "asset-review",
    },
  ],
  currencies: [
    {
      address: "0x7",
      classHash: "0x77",
      symbol: "TEST",
      decimals: 18,
      review: "asset-review",
    },
  ],
  release: {},
});
