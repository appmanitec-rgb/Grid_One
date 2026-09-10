ALTER TYPE "ServiceGroup" ADD VALUE IF NOT EXISTS 'TBC';
ALTER TYPE "ServiceGroup" ADD VALUE IF NOT EXISTS 'TROCA_MANGUEIRAS';
ALTER TYPE "ServiceGroup" ADD VALUE IF NOT EXISTS 'ARREFECIMENTO';

ALTER TABLE "generator_base_items"
  ADD COLUMN "sourceModelDefaultQuantity" INTEGER,
  ADD COLUMN "isCustomized" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

UPDATE "generator_base_items" AS generator_item
SET "sourceModelBaseItemId" = NULL
WHERE "sourceModelBaseItemId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "model_base_items" AS model_item
    WHERE model_item."id" = generator_item."sourceModelBaseItemId"
  );

UPDATE "generator_base_items" AS generator_item
SET "sourceModelDefaultQuantity" = model_item."defaultQuantity",
    "isCustomized" = generator_item."quantity" <> model_item."defaultQuantity"
FROM "model_base_items" AS model_item
WHERE generator_item."sourceModelBaseItemId" = model_item."id";

CREATE INDEX "generator_base_items_sourceModelBaseItemId_idx"
  ON "generator_base_items"("sourceModelBaseItemId");

ALTER TABLE "generator_base_items"
  ADD CONSTRAINT "generator_base_items_sourceModelBaseItemId_fkey"
  FOREIGN KEY ("sourceModelBaseItemId") REFERENCES "model_base_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
