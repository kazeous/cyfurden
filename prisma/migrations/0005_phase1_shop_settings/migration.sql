ALTER TABLE "Booth"
  ADD COLUMN "logoObjectKey" TEXT,
  ADD COLUMN "socialLinks" JSONB;

ALTER TABLE "BoothPaymentInstruction"
  ADD COLUMN "paymentLabel" TEXT NOT NULL DEFAULT 'Bank transfer';
