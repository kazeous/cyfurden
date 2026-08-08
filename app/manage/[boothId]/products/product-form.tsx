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
  IMAGE_SOURCE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_COUNT,
  productImageAccept,
} from "@/lib/payment-qr";
import {
  ImagePreparationError,
  prepareOrdinaryImage,
} from "@/lib/image-preparation";
import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
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
  transportError: string,
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
      error: transportError,
    };
  }
}

async function uploadProductImageDirect(
  file: File,
  boothId: string,
  errors: { start: string; rejected: string },
) {
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
    throw new Error(errors.start);
  }

  const upload = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  });
  if (!upload.ok) {
    throw new Error(errors.rejected);
  }
  return presign.objectKey;
}

export function ProductForm({
  boothId,
  locale,
  value,
  canEdit,
  cancelHref,
}: {
  boothId: string;
  locale: Locale;
  value: ProductEditorValue;
  canEdit: boolean;
  cancelHref: string;
}) {
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.productForm;
  const common = workspaceStrings.common;
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
    const result = await saveProductWithClientFallback(
      previousState,
      formData,
      strings.transportError,
    );
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
      setUploadMessage(strings.rejectedRemoved);
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
      setImageError(strings.imageLimit(PRODUCT_IMAGE_MAX_COUNT));
      setInputKey((current) => current + 1);
      return;
    }
    for (const file of selected) {
      if (file.size > IMAGE_SOURCE_MAX_BYTES) {
        setImageError(strings.imageTooLarge);
        setInputKey((current) => current + 1);
        return;
      }
      if (!productImageAccept.split(",").includes(file.type)) {
        setImageError(strings.imageInvalidType);
        setInputKey((current) => current + 1);
        return;
      }
    }

    setUploading(true);
    try {
      for (const [index, file] of selected.entries()) {
        setUploadMessage(strings.uploadingImage(index + 1, selected.length));
        const preparedFile = await prepareOrdinaryImage(
          file,
          PRODUCT_IMAGE_MAX_BYTES,
        );
        const objectKey = await uploadProductImageDirect(
          preparedFile,
          boothId,
          {
            start: strings.uploadStartFailed,
            rejected: strings.uploadRejected,
          },
        );
        const uploaded: EditableProductImage = {
          clientId: `uploaded-${objectKey}`,
          source: "uploaded",
          objectKey,
          url: URL.createObjectURL(preparedFile),
          alt: "",
        };
        setImages((current) => [...current, uploaded]);
      }
      setUploadMessage(strings.uploadComplete);
    } catch (error) {
      if (!(error instanceof ImagePreparationError)) {
        Sentry.captureException(error, {
          tags: {
            "cyfurden.operation": "product.image_presign_upload",
            "cyfurden.failure_surface": "direct_oci_upload",
          },
        });
      }
      setImageError(
        error instanceof ImagePreparationError
          ? strings.imagePreparationFailed
          : error instanceof Error
            ? error.message
            : strings.uploadFailed,
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
            <h2>
              {value.id ? strings.editTitle(value.name) : strings.createTitle}
            </h2>
            <p>{strings.intro}</p>
          </div>
          {value.id ? (
            <span className={styles.status} data-status={value.status}>
              {common.productStatusLabels[value.status]}
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
          <h3 id="basics-heading">{strings.basics}</h3>
          <p className={styles.helper}>{strings.bilingualHelp}</p>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              {strings.productName}
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
              {strings.urlSlug}
              <input
                name="slug"
                defaultValue={value.slug}
                maxLength={70}
                placeholder={strings.slugPlaceholder}
                aria-describedby="slug-help"
              />
              <small id="slug-help">{strings.slugHelp}</small>
            </label>
            <label className={styles.field}>
              {strings.sku}
              <input
                name="sku"
                defaultValue={value.sku}
                required
                maxLength={80}
              />
              <small>{strings.skuHelp}</small>
            </label>
          </div>
        </section>

        <section
          className={styles.formSection}
          aria-labelledby="pricing-heading"
        >
          <h3 id="pricing-heading">{strings.pricingStock}</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              {strings.priceVnd}
              <input
                name="priceVnd"
                type="number"
                min="0"
                max="9000000000000"
                step="1"
                defaultValue={value.priceVnd}
                required
              />
              <small>{strings.priceHelp}</small>
            </label>
            <label className={styles.field}>
              {strings.productStatus}
              <select name="status" defaultValue={value.status}>
                <option value="DRAFT">
                  {common.productStatusLabels.DRAFT}
                </option>
                <option value="LIVE">{common.productStatusLabels.LIVE}</option>
                <option value="SOLD_OUT">
                  {common.productStatusLabels.SOLD_OUT}
                </option>
                <option value="HIDDEN">
                  {common.productStatusLabels.HIDDEN}
                </option>
              </select>
              <small>{strings.productStatusHelp}</small>
            </label>
            <label className={styles.field}>
              {strings.variantStatus}
              <select name="variantStatus" defaultValue={value.variantStatus}>
                <option value="AVAILABLE">
                  {common.variantStatusLabels.AVAILABLE}
                </option>
                <option value="LOW_STOCK">
                  {common.variantStatusLabels.LOW_STOCK}
                </option>
                <option value="PREORDER">
                  {common.variantStatusLabels.PREORDER}
                </option>
                <option value="SOLD_OUT">
                  {common.variantStatusLabels.SOLD_OUT}
                </option>
                <option value="HIDDEN">
                  {common.variantStatusLabels.HIDDEN}
                </option>
              </select>
              <small>{strings.variantStatusHelp}</small>
            </label>
            <label className={styles.field}>
              {strings.variantLabel}
              <input
                name="variantLabel"
                defaultValue={value.variantLabel}
                maxLength={80}
              />
            </label>
            <label className={styles.field}>
              {strings.stockQuantity}
              <input
                name="stockQuantity"
                type="number"
                min="0"
                max="2147483647"
                step="1"
                defaultValue={value.stockQuantity ?? ""}
                placeholder={strings.untrackedPlaceholder}
              />
              <small>{strings.stockHelp}</small>
            </label>
            <label className={styles.field}>
              {strings.fulfilmentNote}
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
          <h3 id="details-heading">{strings.details}</h3>
          <label className={styles.field}>
            {strings.eyebrow}
            <input name="eyebrow" defaultValue={value.eyebrow} maxLength={80} />
          </label>
          <label className={styles.field}>
            {strings.shortDescription}
            <input
              name="shortDescription"
              defaultValue={value.shortDescription}
              maxLength={240}
            />
          </label>
          <label className={styles.field}>
            {strings.fullDescription}
            <textarea
              name="description"
              defaultValue={value.description}
              required
              maxLength={5000}
            />
          </label>
          <label className={styles.field}>
            {strings.tags}
            <input name="tags" defaultValue={value.tags} maxLength={500} />
            <small>{strings.tagsHelp}</small>
          </label>
        </section>

        <section className={styles.formSection} aria-labelledby="media-heading">
          <h3 id="media-heading">{strings.media}</h3>
          <div className={styles.upload}>
            {images.length ? (
              <div className={styles.imageGallery}>
                {images.map((image, index) => (
                  <article className={styles.imageCard} key={image.clientId}>
                    <div className={styles.imagePreview}>
                      {image.url ? (
                        <img
                          src={image.url}
                          alt={
                            image.alt || value.name || strings.productPreviewAlt
                          }
                        />
                      ) : (
                        <p className={styles.imagePlaceholder}>
                          {strings.imageUnavailable}
                        </p>
                      )}
                      <span className={styles.imagePosition}>
                        {index === 0 ? strings.cover : index + 1}
                      </span>
                    </div>
                    <label className={styles.field}>
                      {strings.altText}
                      <input
                        value={image.alt}
                        disabled={!canEdit || pending || uploading}
                        maxLength={300}
                        placeholder={value.name || strings.describeImage}
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
                        {strings.moveUp}
                      </button>
                      <button
                        className={styles.removeButton}
                        type="button"
                        disabled={
                          index === images.length - 1 || pending || uploading
                        }
                        onClick={() => moveImage(index, 1)}
                      >
                        {strings.moveDown}
                      </button>
                      <button
                        className={styles.removeButton}
                        type="button"
                        disabled={pending || uploading}
                        onClick={() => removeImage(image.clientId)}
                      >
                        {strings.remove}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.imagePreview}>
                <p className={styles.imagePlaceholder}>
                  {strings.emptyImages(PRODUCT_IMAGE_MAX_COUNT)}
                </p>
              </div>
            )}
            <strong className={styles.helper}>
              {strings.imageCount(images.length, PRODUCT_IMAGE_MAX_COUNT)}
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
                  {uploading ? strings.uploading : strings.chooseImages}
                </label>
              ) : null}
            </div>
            {uploadMessage ? (
              <p className={styles.uploadStatus} role="status">
                {uploadMessage}
              </p>
            ) : null}
            <p className={styles.helper}>{strings.imageHelp}</p>
          </div>
        </section>

        <section
          className={styles.formSection}
          aria-labelledby="publishing-heading"
        >
          <h3 id="publishing-heading">{strings.publishing}</h3>
          <label className={styles.checkbox}>
            <input
              name="featured"
              type="checkbox"
              defaultChecked={value.featured}
              disabled={!canEdit || pending}
            />
            <span>
              {strings.featureItem}
              <small className={styles.helper}>{strings.featureHelp}</small>
            </span>
          </label>
        </section>

        {canEdit ? (
          <div className={styles.saveBar}>
            <Link className={styles.cancelButton} href={cancelHref}>
              {strings.cancel}
            </Link>
            <div className={styles.saveActions}>
              <button
                className={styles.saveButton}
                type="submit"
                disabled={pending || uploading}
              >
                {uploading
                  ? strings.uploadingImages
                  : pending
                    ? strings.saving
                    : value.id
                      ? strings.saveChanges
                      : strings.createProduct}
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.helper}>{strings.staffReadOnly}</p>
        )}
      </form>

      {value.id && canEdit ? (
        <div className={styles.dangerZone}>
          <p>
            {value.status === "HIDDEN" ? strings.hiddenHelp : strings.hideHelp}
          </p>
          {value.status !== "HIDDEN" ? (
            <form
              action={hideProductAction}
              onSubmit={(event) => {
                if (!window.confirm(strings.hideConfirm(value.name))) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="boothId" value={boothId} />
              <input type="hidden" name="productId" value={value.id} />
              <button className={styles.dangerButton} type="submit">
                {strings.hideProduct}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
