/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  hideProductAction,
  saveProductAction,
  type ProductSaveState,
} from "../actions";
import { PRODUCT_IMAGE_MAX_BYTES, productImageAccept } from "@/lib/payment-qr";
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
  imageUrl: string | null;
  imageAlt: string;
  imageExists: boolean;
};

const initialState: ProductSaveState = { error: null };

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
  const [state, formAction, pending] = useActionState(
    saveProductAction,
    initialState,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  useEffect(
    () => () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    },
    [imagePreviewUrl],
  );

  const chooseImage = (file: File | undefined) => {
    setImageError(null);
    if (!file) return;
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      setImageError("Product images must be 5 MB or smaller.");
      setInputKey((current) => current + 1);
      return;
    }
    if (file.type && !productImageAccept.split(",").includes(file.type)) {
      setImageError("Choose a PNG, JPEG, or WebP image.");
      setInputKey((current) => current + 1);
      return;
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const discardSelection = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageError(null);
    setInputKey((current) => current + 1);
  };

  const visibleImage =
    imagePreviewUrl || (!removeImage ? value.imageUrl : null);
  const imageLabel = imageFile
    ? "New image selected"
    : value.imageExists && !removeImage
      ? "Current image"
      : "No image";
  const editorError = imageError ?? state.error ?? "";

  return (
    <div className={styles.editor}>
      <form action={formAction}>
        <input type="hidden" name="boothId" value={boothId} />
        <input type="hidden" name="productId" value={value.id ?? ""} />
        <input type="hidden" name="variantId" value={value.variantId ?? ""} />
        <input type="hidden" name="removeImage" value={String(removeImage)} />

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
                autoFocus={!value.id}
              />
            </label>
            <label className={styles.field}>
              URL slug
              <input
                name="slug"
                defaultValue={value.slug}
                placeholder="generated-from-name"
                aria-describedby="slug-help"
              />
              <small id="slug-help">
                Lowercase letters and hyphens are used publicly.
              </small>
            </label>
            <label className={styles.field}>
              SKU
              <input name="sku" defaultValue={value.sku} required />
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
            </label>
            <label className={styles.field}>
              Variant label
              <input name="variantLabel" defaultValue={value.variantLabel} />
            </label>
            <label className={styles.field}>
              Stock quantity
              <input
                name="stockQuantity"
                type="number"
                min="0"
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
            <input name="eyebrow" defaultValue={value.eyebrow} />
          </label>
          <label className={styles.field}>
            Short description
            <input
              name="shortDescription"
              defaultValue={value.shortDescription}
            />
          </label>
          <label className={styles.field}>
            Full description
            <textarea
              name="description"
              defaultValue={value.description}
              required
            />
          </label>
          <label className={styles.field}>
            Tags
            <input name="tags" defaultValue={value.tags} />
            <small>Comma-separated, up to twelve tags.</small>
          </label>
        </section>

        <section className={styles.formSection} aria-labelledby="media-heading">
          <h3 id="media-heading">Media</h3>
          <div className={styles.upload}>
            <div className={styles.imagePreview}>
              {visibleImage ? (
                <img src={visibleImage} alt={value.imageAlt || value.name} />
              ) : (
                <p className={styles.imagePlaceholder}>
                  Add a product image to make this listing easier to scan.
                </p>
              )}
            </div>
            <strong className={styles.helper}>{imageLabel}</strong>
            <input
              key={inputKey}
              id="product-image"
              className={styles.srOnly}
              name="productImage"
              type="file"
              accept={productImageAccept}
              disabled={!canEdit || pending}
              onChange={(event) => chooseImage(event.target.files?.[0])}
            />
            <div className={styles.uploadActions}>
              {canEdit ? (
                <>
                  <label
                    className={styles.uploadButton}
                    htmlFor="product-image"
                  >
                    {value.imageExists || imageFile
                      ? "Replace image"
                      : "Choose image"}
                  </label>
                  {imageFile ? (
                    <button
                      className={styles.removeButton}
                      type="button"
                      onClick={discardSelection}
                    >
                      Discard selection
                    </button>
                  ) : value.imageExists && !removeImage ? (
                    <button
                      className={styles.removeButton}
                      type="button"
                      onClick={() => setRemoveImage(true)}
                    >
                      Remove image
                    </button>
                  ) : value.imageExists ? (
                    <button
                      className={styles.removeButton}
                      type="button"
                      onClick={() => setRemoveImage(false)}
                    >
                      Undo remove
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
            <p className={styles.helper}>
              PNG, JPEG, or WebP up to 5 MB. The storage key stays internal.
            </p>
          </div>
          <label className={styles.field}>
            Image alt text
            <input
              name="imageAlt"
              defaultValue={value.imageAlt}
              disabled={!canEdit}
            />
          </label>
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
                disabled={pending}
              >
                {pending
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
