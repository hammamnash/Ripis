-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('cash', 'debit_account', 'savings_account', 'checking_account', 'prepaid_card', 'e_wallet', 'credit_card', 'loan', 'debt', 'investment_account', 'other');

-- CreateTable
CREATE TABLE "wallet" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "wallet_type" "WalletType" NOT NULL,
    "is_liability" BOOLEAN NOT NULL,
    "currency_id" TEXT NOT NULL,
    "opening_balance" DECIMAL(19,4) NOT NULL,
    "current_balance" DECIMAL(19,4) NOT NULL,
    "institution" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_user_id_deleted_at_idx" ON "wallet"("user_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
