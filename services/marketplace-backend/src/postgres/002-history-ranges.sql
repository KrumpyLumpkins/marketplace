CREATE TABLE chain.history_ranges (
  from_block bigint PRIMARY KEY CHECK(from_block>=0),
  to_block bigint UNIQUE NOT NULL REFERENCES chain.blocks(number) ON DELETE CASCADE,
  end_hash text NOT NULL,
  receipt_blocks integer NOT NULL CHECK(receipt_blocks>0),
  event_count bigint NOT NULL CHECK(event_count>=0),
  CHECK(to_block>=from_block)
);
CREATE INDEX history_ranges_end ON chain.history_ranges(to_block);
