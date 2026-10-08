-- Reuse immutable IPFS artwork across tokens and worker restarts.
CREATE INDEX token_metadata_image_source ON market.token_metadata ((body->'metadata'->>'imageSourceUri')) WHERE body->>'image' IS NOT NULL;
