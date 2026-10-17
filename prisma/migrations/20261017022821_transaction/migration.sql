-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('expense', 'income', 'transfer', 'exchange');

-- CreateTable
CREATE TABLE "transaction" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "transaction_type" "TxType" NOT NULL,
    "occurred_on" DATE NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wallet_id" UUID NOT NULL,
    "destination_wallet_id" UUID,
    "category_id" UUID,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency_id" TEXT NOT NULL,
    "base_amount" DECIMAL(19,4) NOT NULL,
    "base_currency_id" TEXT NOT NULL,
    "destination_amount" DECIMAL(19,4),
    "description" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "merchant" TEXT,
    "location" TEXT,
    "project" TEXT,
    "receipt_number" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_user_id_occurred_on_idx" ON "transaction"("user_id", "occurred_on" DESC);

-- CreateIndex
CREATE INDEX "transaction_user_id_wallet_id_occurred_on_idx" ON "transaction"("user_id", "wallet_id", "occurred_on");

-- CreateIndex
CREATE INDEX "transaction_user_id_category_id_occurred_on_idx" ON "transaction"("user_id", "category_id", "occurred_on");

-- CreateIndex
CREATE INDEX "transaction_user_id_base_amount_idx" ON "transaction"("user_id", "base_amount");

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_destination_wallet_id_fkey" FOREIGN KEY ("destination_wallet_id") REFERENCES "wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_base_currency_id_fkey" FOREIGN KEY ("base_currency_id") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
