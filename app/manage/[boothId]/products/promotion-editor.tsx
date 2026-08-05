"use client";

import { useActionState } from "react";
import {
  savePromotionAction,
  type PromotionSaveState,
} from "@/app/manage/[boothId]/actions";
import { SubmitButton } from "@/components/admin/form-controls";
import { parseBilingual, type Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
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
  locale,
}: {
  legend: string;
  hint: string;
  name: "buyProductIds" | "rewardProductIds";
  products: PromotionEditorProduct[];
  selectedProductIds: string[];
  locale: Locale;
}) {
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.promotion;
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
                <strong>{parseBilingual(product.name, locale)}</strong>
                <small>
                  {product.sku || workspaceStrings.common.noSku} ·{" "}
                  {workspaceStrings.common.productStatusLabels[
                    product.status as keyof typeof workspaceStrings.common.productStatusLabels
                  ] ?? product.status}
                </small>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className={styles.promotionEmpty}>{strings.emptyProducts}</p>
      )}
    </fieldset>
  );
}

export function PromotionEditor({
  boothId,
  locale,
  promotion,
  products,
}: {
  boothId: string;
  locale: Locale;
  promotion: PromotionEditorValue;
  products: PromotionEditorProduct[];
}) {
  const strings = getWorkspaceStrings(locale).promotion;
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
          <p className={styles.promotionEyebrow}>{strings.eyebrow}</p>
          <h2 id="quantity-promotion-heading">{strings.title}</h2>
          <p>{strings.description}</p>
        </div>
        <span className={styles.promotionStatus} data-active={promotion.active}>
          {promotion.active ? strings.active : strings.paused}
        </span>
      </div>

      <form action={action} className={styles.promotionForm}>
        <input type="hidden" name="boothId" value={boothId} />
        {promotion.id ? (
          <input type="hidden" name="promotionId" value={promotion.id} />
        ) : null}

        <label className={styles.field}>
          {strings.offerCopy}
          <input
            name="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={promotion.name}
          />
          <small>{strings.bilingualHelp}</small>
        </label>

        <div className={styles.promotionQuantities}>
          <label className={styles.field}>
            {strings.buyQuantity}
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
            {strings.freeQuantity}
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
            legend={strings.qualifyingLegend(buyCount)}
            hint={strings.qualifyingHint}
            locale={locale}
            name="buyProductIds"
            products={products}
            selectedProductIds={promotion.buyProductIds}
          />
          <ProductPicker
            legend={strings.rewardLegend(rewardCount)}
            hint={strings.rewardHint}
            locale={locale}
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
              {strings.active}
              <small>{strings.activeHelp}</small>
            </span>
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              name="repeatable"
              defaultChecked={promotion.repeatable}
            />
            <span>
              {strings.repeatable}
              <small>{strings.repeatableHelp}</small>
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
          <p>{strings.sameProductHelp}</p>
          <SubmitButton
            className={styles.saveButton}
            pendingLabel={strings.saving}
          >
            {strings.save}
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
