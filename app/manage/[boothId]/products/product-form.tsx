/* eslint-disable @next/next/no-img-element */
"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  discardProductImageUploadAction,
  hideProductAction,
  saveProductAction,
  type ProductSaveState,
} from "../actions";
import {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_COUNT,
  productImageAccept,
} from "@/lib/payment-qr";
import styles from "./products.module.css";

type ProductStatus = "DRAFT" | "LIVE" | "SOLD_OUT" | "HIDDEN";
type VariantStatus =
  | "AVAILABLE"
  | "LOW_STOCK"
  | "PREORDER"
  | "SOLD_OUT"
  | "HIDDEN";

export type ProductEditorValue = {
  id: string | null;
  name: string;
  slug: string;
  sku: string;
  priceVnd: number;
  status: ProductStatus;
  eyebrow: string;
  shortDescription: string;
  description: string;
  tags: string;
  featured: boolean;
  variantId: string | null;
  variantStatus: VariantStatus;
  variantLabel: string;
  stockQuantity: number | null;
  fulfillmentNote: string;
  images: Array<{
    id: string;
    url: string | null;
    alt: string;
  }>;
};

type EditableProductImage =
  | {
      clientId: string;
      source: "existing";
      id: string;
      url: string | null;
      alt: string;
    }
  | {
      clientId: string;
      source: "uploaded";
      objectKey: string;
      url: string;
      alt: string;
    };

type PresignResponse = {
  error?: string;
  objectKey?: string;
  uploadUrl?: string;
};

const initialState: ProductSaveState = { error: null };

const isNextNavigationError = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }
  const digest = String((error as { digest?: unknown }).digest ?? "");
  return (
    digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND")
  );
};

async function saveProductWithClientFallback(
  previousState: ProductSaveState,
  formData: FormData,
): Promise<ProductSaveState> {
  try {
    return await saveProductAction(previousState, formData);
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    Sentry.captureException(error, {
      tags: {
        "cyfurden.operation": "product.save",
        "cyfurden.failure_surface": "server_action_transport",
      },
    });
    return {
      error:
        "We could not send this product to the server. Your entries are still here. Check your connection and image size, then try again.",
    };
  }
}

async function uploadProductImageDirect(file: File, boothId: string) {
  const response = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      boothId,
      purpose: "product",
      contentType: file.type,
      contentLength: file.size,
    }),
  });
  const presign = (await response.json()) as PresignResponse;
  if (!response.ok || !presign.uploadUrl || !presign.objectKey) {
    throw new Error(
      presign.error || "The product image upload could not start.",
    );
  }

  const upload = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  });
  if (!upload.ok) {
    throw new Error("Oracle Object Storage rejected the product image.");
  }
  return presign.objectKey;
}

export function ProductForm({
  boothId,
  value,
  canEdit,
  cancelHref,
}: {
  boothId: string;
  value: ProductEditorValue;
  canEdit: boolean;
  cancelHref: string;
}) {
  const [images, setImages] = useState<EditableProductImage[]>(() =>
    value.images.map((image) => ({
      clientId: `existing-${image.id}`,
      source: "existing",
      ...image,
    })),
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const imagesRef = useRef(images);
  const saveProductWithImageCleanup = async (
    previousState: ProductSaveState,
    formData: FormData,
  ) => {
    const result = await saveProductWithClientFallback(previousState, formData);
    const discarded = result.discardedImageObjectKeys;
    if (discarded?.length) {
      const discardedSet = new Set(discarded);
      setImages((current) =>
        current.filter((image) => {
          if (
            image.source === "uploaded" &&
            discardedSet.has(image.objectKey)
          ) {
            URL.revokeObjectURL(image.url);
            return false;
          }
          return true;
        }),
      );
      setUploadMessage("The rejected uploads were removed. Choose them again.");
    }
    return result;
  };
  const [state, formAction, pending] = useActionState(
    saveProductWithImageCleanup,
    initialState,
  );

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      for (const image of imagesRef.current) {
        if (image.source === "uploaded") URL.revokeObjectURL(image.url);
      }
    };
  }, []);

  const chooseImages = async (files: FileList | null) => {
    setImageError(null);
    setUploadMessage(null);
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    if (images.length + selected.length > PRODUCT_IMAGE_MAX_COUNT) {
      setImageError(
        `A product can have up to ${PRODUCT_IMAGE_MAX_COUNT} images.`,
      );
      setInputKey((current) => current + 1);
      return;
    }
    for (const file of selected) {
      if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
        setImageError("Each product image must be 5 MB or smaller.");
        setInputKey((current) => current + 1);
        return;
      }
      if (!productImageAccept.split(",").includes(file.type)) {
        setImageError("Choose PNG, JPEG, or WebP product images.");
        setInputKey((current) => current + 1);
        return;
      }
    }

    setUploading(true);
    try {
      for (const [index, file] of selected.entries()) {
        setUploadMessage(
          `Uploading image ${index + 1} of ${selected.length} directly to Oracle Object Storage...`,
        );
        const objectKey = await uploadProductImageDirect(file, boothId);
        const uploaded: EditableProductImage = {
          clientId: `uploaded-${objectKey}`,
          source: "uploaded",
          objectKey,
          url: URL.createObjectURL(file),
          alt: "",
        };
        setImages((current) => [...current, uploaded]);
      }
      setUploadMessage(
        "Upload complete. Save the product to verify and attach the images.",
      );
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          "cyfurden.operation": "product.image_presign_upload",
          "cyfurden.failure_surface": "direct_oci_upload",
        },
      });
      setImageError(
        error instanceof Error
          ? error.message
          : "The product images could not be uploaded.",
      );
    } finally {
      setUploading(false);
      setInputKey((current) => current + 1);
    }
  };

  const removeImage = (clientId: string) => {
    const removed = images.find((image) => image.clientId === clientId);
    if (removed?.source === "uploaded") {
      URL.revokeObjectURL(removed.url);
      void discardProductImageUploadAction(boothId, removed.objectKey).catch(
        (error) => {
          Sentry.captureException(error, {
            tags: {
              "cyfurden.operation": "product.image_presign_discard",
            },
          });
        },
      );
    }
    setImages((current) =>
      current.filter((image) => image.clientId !== clientId),
    );
  };

  const updateImageAlt = (clientId: string, alt: string) => {
    setImages((current) =>
      current.map((image) =>
        image.clientId === clientId ? { ...image, alt } : image,
      ),
    );
  };

  const moveImage = (index: number, offset: -1 | 1) => {
    setImages((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const imageManifest = JSON.stringify(
    images.map((image) =>
      image.source === "existing"
        ? { existingId: image.id, alt: image.alt }
        : { objectKey: image.objectKey, alt: image.alt },
    ),
  );
  const editorError = imageError ?? state.error ?? "";

  return (
    <div className={styles.editor}>
      <form action={formAction}>
        <input type="hidden" name="boothId" value={boothId} />
        <input type="hidden" name="productId" value={value.id ?? ""} />
        <input type="hidden" name="variantId" value={value.variantId ?? ""} />
        <input type="hidden" name="imageManifest" value={imageManifest} />

        <div className={styles.editorHeader}>
          <div>
            <h2>{value.id ? `Edit ${value.name}` : "Create product"}</h2>
            <p>
              Keep the listing clear for visitors. Save as draft while you
              prepare the public release.
            </p>
          </div>
          {value.id ? (
            <span className={styles.status} data-status={value.status}>
              {value.status.toLowerCase().replace("_", " ")}
            </span>
          ) : null}
        </div>

        <p className={styles.error} role="alert" aria-live="polite">
          {editorError}
        </p>

        <section
          className={styles.formSection}
          aria-labelledby="basics-heading"
        >
          <h3 id="basics-heading">Basics</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Product name
              <input
                name="name"
                defaultValue={value.name}
                required
                minLength={2}
                maxLength={120}
                autoFocus={!value.id}
              />
            </label>
            <label className={styles.field}>
              URL slug
              <input
                name="slug"
                defaultValue={value.slug}
                maxLength={70}
                placeholder="generated-from-name"
                aria-describedby="slug-help"
              />
              <small id="slug-help">
                Lowercase letters and hyphens are used publicly.
              </small>
            </label>
            <label className={styles.field}>
              SKU
              <input
                name="sku"
                defaultValue={value.sku}
                required
                maxLength={80}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
              />
            </label>
          </div>
        </section>

        <section
          className={styles.formSection}
          aria-labelledby="pricing-heading"
        >
          <h3 id="pricing-heading">Pricing &amp; stock</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Price (VND)
              <input
                name="priceVnd"
                type="number"
                min="0"
                max="9000000000000"
                step="1000"
                defaultValue={value.priceVnd}
                required
              />
              <small>
                Enter whole đồng; the storefront formats the amount.
              </small>
            </label>
            <label className={styles.field}>
              Product status
              <select name="status" defaultValue={value.status}>
                <option value="DRAFT">Draft</option>
                <option value="LIVE">Live</option>
                <option value="SOLD_OUT">Sold out</option>
                <option value="HIDDEN">Hidden</option>
              </select>
              <small>
                Live products become sold out automatically when all tracked
                stock reaches zero.
              </small>
            </label>
            <label className={styles.field}>
              Variant status
              <select name="variantStatus" defaultValue={value.variantStatus}>
                <option value="AVAILABLE">Available</option>
                <option value="LOW_STOCK">Low stock</option>
                <option value="PREORDER">Pre-order</option>
                <option value="SOLD_OUT">Sold out</option>
                <option value="HIDDEN">Hidden</option>
              </select>
              <small>Low-stock variants appear in the attention filter.</small>
            </label>
            <label className={styles.field}>
              Variant label
              <input
                name="variantLabel"
                defaultValue={value.variantLabel}
                maxLength={80}
              />
            </label>
            <label className={styles.field}>
              Stock quantity
              <input
                name="stockQuantity"
                type="number"
                min="0"
                max="2147483647"
                step="1"
                defaultValue={value.stockQuantity ?? ""}
                placeholder="Untracked"
              />
              <small>Leave blank when this item is not stock-counted.</small>
            </label>
            <label className={styles.field}>
              Fulfilment note
              <input
                name="fulfillmentNote"
                defaultValue={value.fulfillmentNote}
                maxLength={500}
              />
            </label>
          </div>
        </section>

        <section
          className={styles.formSection}
          aria-labelledby="details-heading"
        >
          <h3 id="details-heading">Details</h3>
          <label className={styles.field}>
            Eyebrow
            <input name="eyebrow" defaultValue={value.eyebrow} maxLength={80} />
          </label>
          <label className={styles.field}>
            Short description
            <input
              name="shortDescription"
              defaultValue={value.shortDescription}
              maxLength={240}
            />
          </label>
          <label className={styles.field}>
            Full description
            <textarea
              name="description"
              defaultValue={value.description}
              required
              maxLength={5000}
            />
          </label>
          <label className={styles.field}>
            Tags
            <input name="tags" defaultValue={value.tags} maxLength={500} />
            <small>Comma-separated, up to twelve tags.</small>
          </label>
        </section>

        <section className={styles.formSection} aria-labelledby="media-heading">
          <h3 id="media-heading">Media</h3>
          <div className={styles.upload}>
            {images.length ? (
              <div className={styles.imageGallery}>
                {images.map((image, index) => (
                  <article className={styles.imageCard} key={image.clientId}>
                    <div className={styles.imagePreview}>
                      {image.url ? (
                        <img
                          src={image.url}
                          alt={image.alt || value.name || "Product preview"}
                        />
                      ) : (
                        <p className={styles.imagePlaceholder}>
                          Image preview unavailable
                        </p>
                      )}
                      <span className={styles.imagePosition}>
                        {index === 0 ? "Cover" : index + 1}
                      </span>
                    </div>
                    <label className={styles.field}>
                      Alt text
                      <input
                        value={image.alt}
                        disabled={!canEdit || pending || uploading}
                        maxLength={300}
                        placeholder={value.name || "Describe this image"}
                        onChange={(event) =>
                          updateImageAlt(image.clientId, event.target.value)
                        }
                      />
                    </label>
                    <div className={styles.imageActions}>
                      <button
                        className={styles.removeButton}
                        type="button"
                        disabled={index === 0 || pending || uploading}
                        onClick={() => moveImage(index, -1)}
                      >
                        Move up
                      </button>
                      <button
                        className={styles.removeButton}
                        type="button"
                        disabled={
                          index === images.length - 1 || pending || uploading
                        }
                        onClick={() => moveImage(index, 1)}
                      >
                        Move down
                      </button>
                      <button
                        className={styles.removeButton}
                        type="button"
                        disabled={pending || uploading}
                        onClick={() => removeImage(image.clientId)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.imagePreview}>
                <p className={styles.imagePlaceholder}>
                  Add up to {PRODUCT_IMAGE_MAX_COUNT} product images. The first
                  image is used as the catalogue cover.
                </p>
              </div>
            )}
            <strong className={styles.helper}>
              {images.length} of {PRODUCT_IMAGE_MAX_COUNT} images
            </strong>
            <input
              key={inputKey}
              id="product-images"
              className={styles.srOnly}
              type="file"
              multiple
              accept={productImageAccept}
              disabled={
                !canEdit ||
                pending ||
                uploading ||
                images.length >= PRODUCT_IMAGE_MAX_COUNT
              }
              onChange={(event) => void chooseImages(event.target.files)}
            />
            <div className={styles.uploadActions}>
              {canEdit && images.length < PRODUCT_IMAGE_MAX_COUNT ? (
                <label className={styles.uploadButton} htmlFor="product-images">
                  {uploading ? "Uploading..." : "Choose images"}
                </label>
              ) : null}
            </div>
            {uploadMessage ? (
              <p className={styles.uploadStatus} role="status">
                {uploadMessage}
              </p>
            ) : null}
            <p className={styles.helper}>
              PNG, JPEG, or WebP, up to 5 MB each. Images upload directly to
              Oracle and are verified by Cyfurden when you save.
            </p>
          </div>
        </section>

        <section
          className={styles.formSection}
          aria-labelledby="publishing-heading"
        >
          <h3 id="publishing-heading">Publishing</h3>
          <label className={styles.checkbox}>
            <input
              name="featured"
              type="checkbox"
              defaultChecked={value.featured}
              disabled={!canEdit || pending}
            />
            <span>
              Feature this item on the storefront
              <small className={styles.helper}>
                Featured items appear in the public spotlight when available.
              </small>
            </span>
          </label>
        </section>

        {canEdit ? (
          <div className={styles.saveBar}>
            <Link className={styles.cancelButton} href={cancelHref}>
              Cancel
            </Link>
            <div className={styles.saveActions}>
              <button
                className={styles.saveButton}
                type="submit"
                disabled={pending || uploading}
              >
                {uploading
                  ? "Uploading images…"
                  : pending
                    ? "Saving…"
                    : value.id
                      ? "Save changes"
                      : "Create product"}
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.helper}>
            Staff access is read-only for products.
          </p>
        )}
      </form>

      {value.id && canEdit ? (
        <div className={styles.dangerZone}>
          <p>
            {value.status === "HIDDEN"
              ? "This product is hidden. Set Product status to Draft or Live and save to restore it."
              : "Hide removes this item from the public catalogue without deleting its data."}
          </p>
          {value.status !== "HIDDEN" ? (
            <form
              action={hideProductAction}
              onSubmit={(event) => {
                if (
                  !window.confirm(
                    `Hide ${value.name} from the public catalogue?`,
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="boothId" value={boothId} />
              <input type="hidden" name="productId" value={value.id} />
              <button className={styles.dangerButton} type="submit">
                Hide product
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
