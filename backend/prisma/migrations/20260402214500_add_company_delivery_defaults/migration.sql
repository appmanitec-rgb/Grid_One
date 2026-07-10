ALTER TABLE "company_settings"
ADD COLUMN "deliverySenderName" TEXT,
ADD COLUMN "deliveryFromEmail" TEXT,
ADD COLUMN "deliveryReplyToEmail" TEXT,
ADD COLUMN "deliveryDefaultWhatsapp" TEXT,
ADD COLUMN "deliveryDefaultWebhookUrl" TEXT,
ADD COLUMN "deliveryEmailFooter" TEXT;
