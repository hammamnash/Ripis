-- Task 1.7 — the rules that are structural live in the database, not only in the service
-- (`02-context.md` §3). Hand-written, because Prisma's schema language cannot express a CHECK
-- constraint; it is replayed from scratch on the shadow database like any other migration
-- (ADR-0012: migrations go through `prisma migrate`, never hand-run SQL against the dev database).

-- Direction is carried by transaction_type, never by a negative amount (§7). A reconciliation that
-- lowers a balance is an expense row with a positive amount.
ALTER TABLE "transaction" ADD CONSTRAINT amount_positive CHECK (amount > 0);

-- A transfer or an exchange must name a destination wallet
ALTER TABLE "transaction" ADD CONSTRAINT transfer_needs_destination
  CHECK (transaction_type NOT IN ('transfer', 'exchange') OR destination_wallet_id IS NOT NULL);

-- An expense or an income must name a category
ALTER TABLE "transaction" ADD CONSTRAINT income_expense_need_category
  CHECK (transaction_type NOT IN ('expense', 'income') OR category_id IS NOT NULL);

-- An exchange always carries both sides
ALTER TABLE "transaction" ADD CONSTRAINT exchange_needs_destination_amount
  CHECK (transaction_type <> 'exchange' OR destination_amount IS NOT NULL);

-- A budget's limit is a positive amount, like every other amount
ALTER TABLE "budget" ADD CONSTRAINT budget_amount_positive CHECK (amount > 0);

-- The frozen base amount is never null and is always positive (ADR-0004)
ALTER TABLE "transaction" ADD CONSTRAINT base_amount_positive CHECK (base_amount > 0);

-- FR-13: server-side search must not table-scan at 100k rows
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX transaction_description_trgm ON "transaction" USING gin (description gin_trgm_ops);
CREATE INDEX transaction_notes_trgm       ON "transaction" USING gin (notes gin_trgm_ops);
