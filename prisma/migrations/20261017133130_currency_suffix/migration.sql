-- AlterTable
ALTER TABLE "currency" ADD COLUMN     "suffix" BOOLEAN NOT NULL DEFAULT false;

-- Data, and it belongs here rather than in the seed.
--
-- `seedReferenceCurrencies` never updates a row that already exists — that is deliberate, so an
-- operator who corrected a symbol keeps their correction across deploys (ADR-0019's rule, applied
-- to reference data). The consequence for a NEW column is that every row seeded before it would
-- keep the default `false` forever, and VND would render `₫ 5.000.000` instead of `5.000.000 ₫`.
--
-- The placement is a property of the currency (ADR-0032), so it is corrected once, here, where it
-- reaches every environment that already holds the row.
UPDATE "currency" SET "suffix" = true WHERE "code" = 'VND';
