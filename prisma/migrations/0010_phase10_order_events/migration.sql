-- Event dates are booth-local calendar dates represented as half-open UTC
-- ranges. Orders keep an optional booth-scoped event attribution so legacy
-- and out-of-event reservations remain valid and queryable.
CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "boothId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Event_date_range_check" CHECK ("startsAt" < "endsAt"),
  CONSTRAINT "Event_name_check" CHECK (length(btrim("name")) BETWEEN 2 AND 100)
);

CREATE UNIQUE INDEX "Event_id_boothId_key" ON "Event"("id", "boothId");
CREATE INDEX "Event_boothId_startsAt_endsAt_idx"
ON "Event"("boothId", "startsAt", "endsAt");

ALTER TABLE "Event"
ADD CONSTRAINT "Event_boothId_fkey"
FOREIGN KEY ("boothId") REFERENCES "Booth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "eventId" TEXT;

CREATE INDEX "Order_boothId_eventId_placedAt_idx"
ON "Order"("boothId", "eventId", "placedAt");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_eventId_boothId_fkey"
FOREIGN KEY ("eventId", "boothId") REFERENCES "Event"("id", "boothId")
ON DELETE RESTRICT ON UPDATE CASCADE;
