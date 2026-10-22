-- CreateTable
CREATE TABLE "balance_snapshot" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "currency_id" TEXT NOT NULL,
    "balance" DECIMAL(19,4) NOT NULL,
    "value" DECIMAL(19,4) NOT NULL,
    "is_liability" BOOLEAN NOT NULL,
    "captured_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balance_snapshot_user_id_month_idx" ON "balance_snapshot"("user_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "balance_snapshot_user_id_wallet_id_month_key" ON "balance_snapshot"("user_id", "wallet_id", "month");

-- AddForeignKey
ALTER TABLE "balance_snapshot" ADD CONSTRAINT "balance_snapshot_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_snapshot" ADD CONSTRAINT "balance_snapshot_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_snapshot" ADD CONSTRAINT "balance_snapshot_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
