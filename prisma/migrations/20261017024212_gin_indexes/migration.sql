-- CreateIndex
CREATE INDEX "transaction_tags_idx" ON "transaction" USING GIN ("tags" array_ops);
