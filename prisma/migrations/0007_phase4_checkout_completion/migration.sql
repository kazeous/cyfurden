ALTER TABLE "BoothPaymentInstruction"
  ALTER COLUMN "transferReferenceTemplate" SET DEFAULT '{code}';

UPDATE "BoothPaymentInstruction"
SET "transferReferenceTemplate" = '{code}'
WHERE "transferReferenceTemplate" = 'CYF-{ORDER}';

UPDATE "Order"
SET "transferReference" = "code"
WHERE char_length("transferReference") > 25;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_transferReference_vietqr_length"
  CHECK (char_length("transferReference") BETWEEN 1 AND 25);
