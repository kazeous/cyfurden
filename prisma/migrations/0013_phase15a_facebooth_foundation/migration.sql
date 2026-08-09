CREATE TYPE "FaceboothProjectKind" AS ENUM ('MERCH', 'SCENE');

CREATE TABLE "FaceboothProject" (
  "id" TEXT NOT NULL,
  "boothId" TEXT NOT NULL,
  "kind" "FaceboothProjectKind" NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "editVersion" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL,
  "document" JSONB NOT NULL,
  "previewObjectKey" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FaceboothProject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaceboothProject_schema_version_check"
    CHECK ("schemaVersion" = 1),
  CONSTRAINT "FaceboothProject_edit_version_check"
    CHECK ("editVersion" >= 1),
  CONSTRAINT "FaceboothProject_name_check"
    CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "FaceboothProject_preview_key_check"
    CHECK (
      "previewObjectKey" IS NULL
      OR char_length("previewObjectKey") BETWEEN 1 AND 512
    )
);

CREATE TABLE "FaceboothPublication" (
  "id" TEXT NOT NULL,
  "boothId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "document" JSONB NOT NULL,
  "previewObjectKey" TEXT,
  "publishedById" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FaceboothPublication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaceboothPublication_schema_version_check"
    CHECK ("schemaVersion" = 1),
  CONSTRAINT "FaceboothPublication_revision_check"
    CHECK ("revision" >= 1),
  CONSTRAINT "FaceboothPublication_preview_key_check"
    CHECK (
      "previewObjectKey" IS NULL
      OR char_length("previewObjectKey") BETWEEN 1 AND 512
    )
);

CREATE UNIQUE INDEX "FaceboothProject_id_boothId_key"
ON "FaceboothProject"("id", "boothId");

CREATE INDEX "FaceboothProject_boothId_kind_updatedAt_idx"
ON "FaceboothProject"("boothId", "kind", "updatedAt" DESC);

CREATE UNIQUE INDEX "FaceboothPublication_boothId_key"
ON "FaceboothPublication"("boothId");

CREATE INDEX "FaceboothPublication_boothId_revision_idx"
ON "FaceboothPublication"("boothId", "revision");

ALTER TABLE "FaceboothProject"
ADD CONSTRAINT "FaceboothProject_boothId_fkey"
FOREIGN KEY ("boothId") REFERENCES "Booth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FaceboothProject"
ADD CONSTRAINT "FaceboothProject_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FaceboothProject"
ADD CONSTRAINT "FaceboothProject_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FaceboothPublication"
ADD CONSTRAINT "FaceboothPublication_boothId_fkey"
FOREIGN KEY ("boothId") REFERENCES "Booth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FaceboothPublication"
ADD CONSTRAINT "FaceboothPublication_publishedById_fkey"
FOREIGN KEY ("publishedById") REFERENCES "user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
