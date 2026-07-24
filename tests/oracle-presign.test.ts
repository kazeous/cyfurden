import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBoothUploadObjectKey,
  isBoothProductImageObjectKey,
  PRESIGNED_UPLOAD_MAX_BYTES,
  presignedUploadRequestSchema,
} from "../lib/oracle-presign-contract";

test("presigned upload requests enforce purpose, image type, and byte limits", () => {
  const valid = presignedUploadRequestSchema.parse({
    boothId: "booth_123",
    purpose: "logo",
    contentType: "image/png",
    contentLength: 2_048,
  });
  assert.equal(valid.purpose, "logo");
  assert.equal(
    presignedUploadRequestSchema.safeParse({ ...valid, purpose: "product" })
      .success,
    true,
  );

  for (const request of [
    { ...valid, purpose: "payment-qr" },
    { ...valid, contentType: "text/plain" },
    { ...valid, contentLength: PRESIGNED_UPLOAD_MAX_BYTES + 1 },
    { ...valid, contentLength: 0 },
    { ...valid, extra: true },
  ]) {
    assert.equal(
      presignedUploadRequestSchema.safeParse(request).success,
      false,
    );
  }
});

test("product upload keys stay inside the selected booth product prefix", () => {
  const objectKey = buildBoothUploadObjectKey({
    boothId: "booth/123",
    purpose: "product",
    contentType: "image/webp",
  });

  assert.match(
    objectKey,
    /^booths\/booth123\/products\/image-[a-f0-9-]+\.webp$/i,
  );
  assert.equal(isBoothProductImageObjectKey("booth/123", objectKey), true);
  assert.equal(isBoothProductImageObjectKey("another-booth", objectKey), false);
  assert.equal(
    isBoothProductImageObjectKey(
      "booth/123",
      "booths/booth123/products/../identity/logo-stolen.webp",
    ),
    false,
  );
});

test("booth upload keys use an identity prefix and never include a caller filename", () => {
  const objectKey = buildBoothUploadObjectKey({
    boothId: "booth/123",
    purpose: "logo",
    contentType: "image/jpeg",
  });

  assert.match(
    objectKey,
    /^booths\/booth123\/identity\/logo-[a-f0-9-]+\.jpg$/i,
  );
  assert.doesNotMatch(objectKey, /\.exe|filename|\.\.\//i);
});
