"use client";

import { useActionState } from "react";
import {
  savePromotionAction,
  type PromotionSaveState,
} from "@/app/manage/[boothId]/actions";
import { SubmitButton } from "@/components/admin/form-controls";
import styles from "./products.module.css";

type PromotionEditorProduct = {
  id: string;
  name: string;
  sku: string | null;
  status: string;
};

type PromotionEditorValue = {
  id: string | null;
  name: string;
  buyQuantity: number;
  rewardQuantity: number;
  active: boolean;
  repeatable: boolean;
  buyProductIds: string[];
  rewardProductIds: string[];
};

const initialState: PromotionSaveState = { error: null };

function ProductPicker({
  legend,
  hint,
  name,
  products,
  selectedProductIds,
}: {
  legend: string;
  hint: string;
  name: "buyProductIds" | "rewardProductIds";
  products: PromotionEditorProduct[];
  selectedProductIds: string[];
}) {
  const selected = new Set(selectedProductIds);
  return (
    <fieldset className={styles.promotionPicker}>
      <legend>{legend}</legend>
      <p>{hint}</p>
      {products.length ? (
        <div className={styles.promotionProductList}>
          {products.map((product) => (
            <label key={product.id}>
              <input
                type="checkbox"
                name={name}
                value={product.id}
                defaultChecked={selected.has(product.id)}
              />
              <span>
                <strong>{product.name}</strong>
                <small>
                  {product.sku || "No SKU"} ·{" "}
                  {product.status.toLowerCase().replaceAll("_", " ")}
                </small>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className={styles.promotionEmpty}>
          Create a product before choosing qualifying or reward items.
        </p>
      )}
    </fieldset>
  );
}

export function PromotionEditor({
  boothId,
  promotion,
  products,
}: {
  boothId: string;
  promotion: PromotionEditorValue;
  products: PromotionEditorProduct[];
}) {
  const [state, action] = useActionState(savePromotionAction, initialState);
  const buyCount = promotion.buyProductIds.length;
  const rewardCount = promotion.rewardProductIds.length;

  return (
    <section
      className={styles.promotionPanel}
      aria-labelledby="quantity-promotion-heading"
    >
      <div className={styles.promotionHeader}>
        <div>
          <p className={styles.promotionEyebrow}>Cart offer</p>
          <h2 id="quantity-promotion-heading">Quantity promotion</h2>
          <p>
            Reward selected cart items after the customer adds enough qualifying
            products. Pricing is finalized when stock is reserved.
          </p>
        </div>
        <span className={styles.promotionStatus} data-active={promotion.active}>
          {promotion.active ? "Active" : "Paused"}
        </span>
      </div>

      <form action={action} className={styles.promotionForm}>
        <input type="hidden" name="boothId" value={boothId} />
        {promotion.id ? (
          <input type="hidden" name="promotionId" value={promotion.id} />
        ) : null}

        <label className={styles.field}>
          Offer copy
          <input
            name="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={promotion.name}
          />
          <small>
            Public copy supports{" "}
            <code>[en]English[/en][vi]Tiếng Việt[/vi]</code>.
          </small>
        </label>

        <div className={styles.promotionQuantities}>
          <label className={styles.field}>
            Buy quantity
            <input
              name="buyQuantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              required
              defaultValue={promotion.buyQuantity}
            />
          </label>
          <label className={styles.field}>
            Free quantity
            <input
              name="rewardQuantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              required
              defaultValue={promotion.rewardQuantity}
            />
          </label>
        </div>

        <div className={styles.promotionPickers}>
          <ProductPicker
            legend={`Qualifying products · ${buyCount} selected`}
            hint="Paid units from these products unlock the reward."
            name="buyProductIds"
            products={products}
            selectedProductIds={promotion.buyProductIds}
          />
          <ProductPicker
            legend={`Reward products · ${rewardCount} selected`}
            hint="Eligible units from these products become free."
            name="rewardProductIds"
            products={products}
            selectedProductIds={promotion.rewardProductIds}
          />
        </div>

        <div className={styles.promotionToggles}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              name="active"
              defaultChecked={promotion.active}
            />
            <span>
              Active
              <small>
                Show the nudge and apply rewards to new reservations.
              </small>
            </span>
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              name="repeatable"
              defaultChecked={promotion.repeatable}
            />
            <span>
              Repeatable
              <small>Let one cart unlock the offer more than once.</small>
            </span>
          </label>
        </div>

        <p
          className={styles.promotionError}
          role={state.error ? "alert" : undefined}
        >
          {state.error}
        </p>
        <div className={styles.promotionActions}>
          <p>
            Same-product offers are supported: buy 3, get 1 requires four units
            in the cart.
          </p>
          <SubmitButton
            className={styles.saveButton}
            pendingLabel="Saving offer…"
          >
            Save promotion
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
