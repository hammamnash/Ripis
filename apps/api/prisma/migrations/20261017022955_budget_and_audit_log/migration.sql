-- CreateEnum
CREATE TYPE "AuditEntity" AS ENUM ('transaction', 'wallet', 'budget', 'category', 'user', 'auth', 'export');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('created', 'updated', 'deleted', 'restored', 'archived', 'exported', 'signed_in', 'auth_failed', 'password_changed');

-- CreateTable
CREATE TABLE "budget" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "month" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "entity_type" "AuditEntity" NOT NULL,
    "entity_id" UUID,
    "action" "AuditAction" NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_user_id_category_id_month_key" ON "budget"("user_id", "category_id", "month");

-- CreateIndex
CREATE INDEX "audit_log_user_id_created_at_idx" ON "audit_log"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
