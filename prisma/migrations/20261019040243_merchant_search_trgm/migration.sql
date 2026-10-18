-- FR-13, §13: search covers Description, Notes and Merchant.
--
-- Task 1.7 indexed the first two. The requirement names three fields, and `merchant` had no index of its
-- own — so the search, which is one `OR` over the three columns, lost the plan the other two bought: one
-- unindexed branch is enough for the planner to fall back on a sequential scan of the whole ledger. The
-- column is nullable, and a GIN trigram index simply carries no entry for a NULL, so rows without a
-- merchant cost nothing here.
CREATE INDEX transaction_merchant_trgm ON "transaction" USING gin (merchant gin_trgm_ops);
