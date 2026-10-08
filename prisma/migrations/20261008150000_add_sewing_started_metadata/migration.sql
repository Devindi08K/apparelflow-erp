ALTER TABLE "cutting_orders"
ADD COLUMN "sewing_started_by" TEXT,
ADD COLUMN "sewing_started_at" TIMESTAMP(3);

ALTER TABLE "cutting_orders"
ADD CONSTRAINT "cutting_orders_sewing_started_by_fkey"
FOREIGN KEY ("sewing_started_by") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;