ALTER TABLE "BoothPaymentInstruction"
  ADD COLUMN "bankCode" TEXT;

ALTER TABLE "Order"
  ADD COLUMN "customerTransferReference" TEXT;
