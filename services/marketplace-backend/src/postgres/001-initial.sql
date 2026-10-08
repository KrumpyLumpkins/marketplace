CREATE SCHEMA IF NOT EXISTS chain;
CREATE SCHEMA IF NOT EXISTS market;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS media;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE chain.meta(key text PRIMARY KEY, value jsonb NOT NULL);
INSERT INTO chain.meta VALUES ('generation','1'::jsonb);
CREATE TABLE chain.blocks(number bigint PRIMARY KEY CHECK(number>=0),hash text UNIQUE NOT NULL,parent text NOT NULL,timestamp bigint NOT NULL);
CREATE TABLE chain.events(block_hash text NOT NULL,tx text NOT NULL,idx integer NOT NULL,body jsonb NOT NULL,PRIMARY KEY(block_hash,tx,idx));
CREATE TABLE chain.undo(height bigint NOT NULL,kind text NOT NULL,id text NOT NULL,before jsonb,PRIMARY KEY(height,kind,id));
CREATE INDEX undo_rewind ON chain.undo(height DESC);
CREATE TABLE market.collections(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE TABLE market.tokens(
 id text PRIMARY KEY,body jsonb NOT NULL,
 collection text GENERATED ALWAYS AS (body->>'collection') STORED NOT NULL,
 token_id numeric(78,0) GENERATED ALWAYS AS ((body->>'tokenId')::numeric) STORED NOT NULL,
 owner text GENERATED ALWAYS AS (body->>'owner') STORED NOT NULL,
 burned boolean GENERATED ALWAYS AS (COALESCE((body->>'burned')::boolean,false)) STORED,
 first_seen_block bigint GENERATED ALWAYS AS ((body->>'firstSeenBlock')::bigint) STORED,
 CHECK(token_id>=0 AND token_id<115792089237316195423570985008687907853269984665640564039457584007913129639936),
 CHECK(jsonb_typeof(body->'tokenId')='string' AND body->>'tokenId' ~ '^(0|[1-9][0-9]*)$'),
 UNIQUE(collection,token_id)
);
CREATE INDEX tokens_owner ON market.tokens(owner,collection,token_id) WHERE NOT burned;
CREATE INDEX tokens_collection ON market.tokens(collection,token_id) WHERE NOT burned;
CREATE TABLE market.orders(
 id text PRIMARY KEY,body jsonb NOT NULL,
 kind text GENERATED ALWAYS AS (body->>'kind') STORED NOT NULL CHECK(kind IN ('listing','token_offer','collection_offer')),
 state text GENERATED ALWAYS AS (body->>'state') STORED NOT NULL CHECK(state IN ('open','filled','cancelled')),
 maker text GENERATED ALWAYS AS (body->>'maker') STORED NOT NULL,
 nonce numeric(20,0) GENERATED ALWAYS AS ((body->>'nonce')::numeric) STORED NOT NULL CHECK(nonce>0 AND nonce<18446744073709551616),
 collection text GENERATED ALWAYS AS (body->>'collection') STORED NOT NULL,
 token_id numeric(78,0) GENERATED ALWAYS AS ((body->>'tokenId')::numeric) STORED,
 currency text GENERATED ALWAYS AS (body->>'currency') STORED NOT NULL,
 buyer_debit numeric(78,0) GENERATED ALWAYS AS ((body->>'buyerDebit')::numeric) STORED NOT NULL CHECK(buyer_debit>0 AND buyer_debit<115792089237316195423570985008687907853269984665640564039457584007913129639936),
 expiry numeric(20,0) GENERATED ALWAYS AS ((body->>'expiry')::numeric) STORED NOT NULL CHECK(expiry>=0 AND expiry<18446744073709551616),
 fee_bps integer GENERATED ALWAYS AS ((body->>'feeBps')::integer) STORED CHECK(fee_bps BETWEEN 0 AND 500),
 CHECK(jsonb_typeof(body->'buyerDebit')='string' AND body->>'buyerDebit' ~ '^[1-9][0-9]*$'),
 CHECK(jsonb_typeof(body->'nonce')='string' AND body->>'nonce' ~ '^[1-9][0-9]*$'),
 CHECK(jsonb_typeof(body->'expiry')='string' AND body->>'expiry' ~ '^(0|[1-9][0-9]*)$'),
 CHECK((kind='collection_offer') = (token_id IS NULL)),
 CHECK(token_id IS NULL OR (jsonb_typeof(body->'tokenId')='string' AND body->>'tokenId' ~ '^(0|[1-9][0-9]*)$')),
 UNIQUE(maker,nonce),
 CHECK(token_id IS NULL OR (token_id>=0 AND token_id<115792089237316195423570985008687907853269984665640564039457584007913129639936))
);
CREATE INDEX orders_listing ON market.orders(collection,token_id,currency,buyer_debit,id) WHERE kind='listing' AND state='open';
CREATE INDEX orders_offers ON market.orders(collection,currency,buyer_debit DESC,id) WHERE kind IN ('token_offer','collection_offer') AND state='open';
CREATE INDEX orders_maker ON market.orders(maker,state,id);
CREATE TABLE market.activity(
 id text PRIMARY KEY,body jsonb NOT NULL,
 type text GENERATED ALWAYS AS (body->>'type') STORED NOT NULL,
 block_number bigint GENERATED ALWAYS AS ((body->'provenance'->>'blockNumber')::bigint) STORED NOT NULL,
 transaction_hash text GENERATED ALWAYS AS (body->'provenance'->>'transactionHash') STORED NOT NULL,
 collection text GENERATED ALWAYS AS (body->>'collection') STORED,
 token_id numeric(78,0) GENERATED ALWAYS AS ((body->>'tokenId')::numeric) STORED,
 currency text GENERATED ALWAYS AS (body->>'currency') STORED,
 timestamp bigint GENERATED ALWAYS AS ((body->'provenance'->>'timestamp')::bigint) STORED NOT NULL
);
CREATE INDEX activity_position ON market.activity(block_number DESC,id);
CREATE INDEX activity_collection ON market.activity(collection,block_number DESC,id);
CREATE INDEX activity_transaction ON market.activity(transaction_hash);
CREATE INDEX activity_maker ON market.activity((body->>'maker'),block_number DESC);
CREATE INDEX activity_buyer ON market.activity((body->>'buyer'),block_number DESC);
CREATE INDEX activity_seller ON market.activity((body->>'seller'),block_number DESC);
CREATE TABLE chain.progress(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE TABLE chain.status(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE TABLE market.configuration(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE TABLE market.policies(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE TABLE market.approvals(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE TABLE market.operator_approvals(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE TABLE market.metadata_jobs(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE INDEX metadata_jobs_pending ON market.metadata_jobs((body->>'state'));
CREATE TABLE market.token_metadata(
 id text PRIMARY KEY,body jsonb NOT NULL,
 CHECK(body - ARRAY['metadata','attributes','resourceCount','image','metadataUri','metadataHash','metadataStatus','metadataError','metadataFetchedAt','metadataNextAttempt']::text[] = '{}'::jsonb)
);
CREATE INDEX metadata_name_search ON market.token_metadata USING gin ((body->'metadata'->>'name') gin_trgm_ops);
CREATE TABLE market.attributes(token_id text NOT NULL,name text NOT NULL,value jsonb NOT NULL,numeric_value numeric,text_value text,PRIMARY KEY(token_id,name,value));
CREATE INDEX attributes_filter ON market.attributes(name,text_value,token_id);
CREATE INDEX attributes_numeric ON market.attributes(name,numeric_value,token_id);
CREATE TABLE market.daily_stats(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE INDEX stats_collection_day ON market.daily_stats((body->>'collection'),((body->>'day')::bigint),(body->>'currency'));
CREATE TABLE market.floor_current(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE TABLE market.floor_history(id text PRIMARY KEY,body jsonb NOT NULL);
CREATE INDEX floor_history_collection ON market.floor_history((body->>'collection'),((body->>'timestamp')::bigint));
CREATE TABLE chain.notification_outbox(id text NOT NULL,account text NOT NULL,body jsonb NOT NULL,height bigint NOT NULL,canonical boolean NOT NULL DEFAULT true,PRIMARY KEY(id,account));
CREATE INDEX notifications_account ON chain.notification_outbox(account,height DESC);
CREATE TABLE app.notification_reads(id text NOT NULL,account text NOT NULL,is_read boolean NOT NULL DEFAULT false,PRIMARY KEY(id,account));
CREATE TABLE app.app_meta(key text PRIMARY KEY,value jsonb NOT NULL);
CREATE TABLE app.challenges(id text PRIMARY KEY,account text NOT NULL,message jsonb NOT NULL,expires bigint NOT NULL,used boolean NOT NULL DEFAULT false);
CREATE INDEX challenges_expiry ON app.challenges(expires);
CREATE TABLE app.sessions(token_hash text PRIMARY KEY,account text NOT NULL,expires bigint NOT NULL);
CREATE INDEX sessions_expiry ON app.sessions(expires);
CREATE TABLE app.reports(id text PRIMARY KEY,account text NOT NULL,body jsonb NOT NULL,status text NOT NULL DEFAULT 'open',created bigint NOT NULL);
CREATE TABLE app.moderation(collection text PRIMARY KEY,body jsonb NOT NULL);
CREATE TABLE app.audit(id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,actor text NOT NULL,action text NOT NULL,body jsonb NOT NULL,created bigint NOT NULL);
CREATE TABLE media.assets(name text PRIMARY KEY CHECK(name ~ '^[a-f0-9]{64}\.(png|jpg|gif|webp|svg)$'),content_type text NOT NULL,bytes bytea NOT NULL CHECK(octet_length(bytes)<=10485760));
