/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import {
  submitCustomerTransferReferenceAction,
  type CustomerTransferReferenceState,
} from "@/app/s/[slug]/reservation/[code]/actions";
import {
  parseBilingual,
  translate,
  type Locale,
  type PublicReservationStrings,
} from "@/lib/i18n";
import { formatMoney } from "@/lib/i18n/intl";
import type { StorefrontDocument } from "@/lib/storefront-document";
import styles from "./reservation-confirmation.module.css";

type PaymentDetails = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  paymentLabel: string;
  instructions: string;
  disclaimer: string;
  qrUrl?: string;
  qrSource?: string;
};

type ReservationDetails = {
  code: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "FULFILLED";
  currency: string;
  subtotalMinorUnits: string;
  totalMinorUnits: string;
  transferReference: string;
  fulfillmentMethod: "PICKUP" | "SHIP" | null;
  customerTransferReference: string | null;
  idempotencyKey: string;
  items: Array<{
    id: string;
    title: string;
    variant: string | null;
    quantity: number;
    unitPriceMinorUnits: string;
    originalUnitPriceMinorUnits: string | null;
    promotionName: string | null;
  }>;
};

type CopyTarget = "reservation" | "account" | "reference";

const copyTargetLabel = (
  target: CopyTarget,
  t: PublicReservationStrings,
): string => {
  switch (target) {
    case "reservation":
      return t.copyNumber;
    case "account":
      return t.copyAccount;
    case "reference":
      return t.copyReference;
  }
};

const initialReferenceState: CustomerTransferReferenceState = {
  status: "idle",
  message: "",
};

export function ReservationConfirmation({
  boothSlug,
  document,
  reservation,
  payment,
  locale = "en",
}: {
  boothSlug: string;
  document: StorefrontDocument;
  reservation: ReservationDetails;
  payment: PaymentDetails | null;
  locale?: Locale;
}) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [referenceState, referenceAction, referencePending] = useActionState(
    submitCustomerTransferReferenceAction,
    initialReferenceState,
  );
  const t = translate(locale, "publicReservation");
  const b = (value: string | null | undefined) => parseBilingual(value, locale);
  const total = formatMoney(
    reservation.totalMinorUnits,
    reservation.currency,
    locale,
  );
  const subtotal = formatMoney(
    reservation.subtotalMinorUnits,
    reservation.currency,
    locale,
  );
  const promotionSavings =
    BigInt(reservation.subtotalMinorUnits) -
    BigInt(reservation.totalMinorUnits);
  const statusCopy = t.statusBlocks(reservation.status);
  const paymentRequired = reservation.status === "PENDING";
  const hasBankAccount = Boolean(
    payment?.bankName && payment.accountName && payment.accountNumber,
  );

  useEffect(() => {
    const storageKey = `cyfurden:cart:${boothSlug}`;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const value = JSON.parse(stored) as { idempotencyKey?: unknown };
      if (value.idempotencyKey === reservation.idempotencyKey) {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // A completed reservation does not depend on browser storage cleanup.
    }
  }, [boothSlug, reservation.idempotencyKey]);

  const copy = async (target: CopyTarget, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      setCopyError(false);
    } catch {
      setCopied(null);
      setCopyError(true);
    }
  };

  return (
    <main
      className={styles.page}
      data-theme={document.themePreset}
      style={{ "--accent": document.accentColor } as React.CSSProperties}
    >
      <header className={styles.topbar}>
        <a className={styles.brand} href={`/s/${boothSlug}`}>
          <span className={styles.brandMark} aria-hidden="true">
            C
          </span>
          <span>
            <strong>{b(document.name)}</strong>
            <small>
              {b(document.eventName)} · {b(document.eventBoothLabel)}
            </small>
          </span>
        </a>
        <a className={styles.backLink} href={`/s/${boothSlug}`}>
          {t.backToBooth}
        </a>
      </header>

      <div className={styles.content}>
        <section className={styles.receipt} aria-labelledby="receipt-heading">
          <div className={styles.receiptCopy}>
            <p className={styles.eyebrow}>{t.receiptEyebrow}</p>
            <h1 id="receipt-heading">{statusCopy.heading}</h1>
            <p>{statusCopy.description}</p>
          </div>
          <div className={styles.referenceBlock}>
            <span>{t.referenceCaption}</span>
            <strong>{reservation.code}</strong>
            <button
              type="button"
              onClick={() => copy("reservation", reservation.code)}
              data-copied={copied === "reservation"}
            >
              {copied === "reservation" ? t.copied : t.copyNumber}
            </button>
          </div>
        </section>

        <div className={styles.handoffGrid}>
          <section
            className={styles.paymentCard}
            aria-labelledby="payment-heading"
          >
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>
                {b(payment?.paymentLabel) || t.paymentLabelFallback}
              </p>
              <h2 id="payment-heading">
                {paymentRequired ? t.paymentHeading : statusCopy.heading}
              </h2>
              <p>
                {paymentRequired ? t.paymentSubhead : statusCopy.description}
              </p>
            </div>

            {paymentRequired && payment ? (
              <>
                <ol className={styles.steps}>
                  <li>
                    <span>1</span>
                    {t.paymentStep1}
                  </li>
                  <li>
                    <span>2</span>
                    {t.paymentStep2}
                  </li>
                  <li>
                    <span>3</span>
                    {t.paymentStep3}
                  </li>
                </ol>

                <div className={styles.paymentGrid}>
                  <div className={styles.qrPanel}>
                    {payment.qrUrl ? (
                      <>
                        <img
                          src={payment.qrUrl}
                          alt={t.qrAlt(payment.accountName)}
                        />
                        {payment.qrSource ? (
                          <small>{payment.qrSource}</small>
                        ) : null}
                      </>
                    ) : (
                      <div className={styles.qrFallback}>
                        <strong>{t.qrUnavailableHeading}</strong>
                        <span>{t.qrUnavailableHint}</span>
                      </div>
                    )}
                  </div>

                  <dl className={styles.bankDetails}>
                    {hasBankAccount ? (
                      <>
                        <div>
                          <dt>{t.bankLabel}</dt>
                          <dd>{payment.bankName}</dd>
                        </div>
                        <div>
                          <dt>{t.accountNameLabel}</dt>
                          <dd>{payment.accountName}</dd>
                        </div>
                        <div>
                          <dt>{t.accountNumberLabel}</dt>
                          <dd className={styles.copyValue}>
                            <strong>{payment.accountNumber}</strong>
                            <button
                              type="button"
                              onClick={() =>
                                copy("account", payment.accountNumber)
                              }
                              data-copied={copied === "account"}
                            >
                              {copied === "account" ? t.copied : t.copyAccount}
                            </button>
                          </dd>
                        </div>
                      </>
                    ) : null}
                    <div>
                      <dt>{t.reservationTotalLabel}</dt>
                      <dd className={styles.total}>{total}</dd>
                    </div>
                    <div>
                      <dt>{t.transferReferenceLabel}</dt>
                      <dd className={styles.copyValue}>
                        <strong>{reservation.transferReference}</strong>
                        <button
                          type="button"
                          onClick={() =>
                            copy("reference", reservation.transferReference)
                          }
                          data-copied={copied === "reference"}
                        >
                          {copied === "reference" ? t.copied : t.copyReference}
                        </button>
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className={styles.ownerNote}>
                  <strong>{t.boothInstructionsHeading}</strong>
                  <p>{b(payment.instructions)}</p>
                </div>
                <form action={referenceAction} className={styles.referenceForm}>
                  <strong>{t.referenceFormHeading}</strong>
                  <p>{t.referenceFormBody}</p>
                  <input type="hidden" name="slug" value={boothSlug} />
                  <input type="hidden" name="code" value={reservation.code} />
                  <input type="hidden" name="locale" value={locale} />
                  <label>
                    {t.referenceFieldLabel}
                    <input
                      name="customerTransferReference"
                      defaultValue={reservation.customerTransferReference ?? ""}
                      maxLength={120}
                      required
                      disabled={referencePending}
                    />
                  </label>
                  <button type="submit" disabled={referencePending}>
                    {referencePending
                      ? t.referenceSubmitting
                      : t.referenceSubmit}
                  </button>
                  <p
                    className={
                      referenceState.status === "error"
                        ? styles.referenceError
                        : styles.referenceStatus
                    }
                    role={
                      referenceState.status === "error" ? "alert" : "status"
                    }
                  >
                    {referenceState.message}
                  </p>
                </form>
                <p className={styles.disclaimer}>{b(payment.disclaimer)}</p>
              </>
            ) : paymentRequired ? (
              <div className={styles.paymentUnavailable}>
                <strong>{t.paymentUnavailableHeading}</strong>
                <p>{t.paymentUnavailableBody}</p>
              </div>
            ) : (
              <div className={styles.paymentUnavailable}>
                <strong>{t.noTransferHeading}</strong>
                <p>{statusCopy.description}</p>
              </div>
            )}
          </section>

          <aside className={styles.summary} aria-labelledby="summary-heading">
            <p className={styles.eyebrow}>{t.summaryEyebrow}</p>
            <h2 id="summary-heading">{t.summaryHeading}</h2>
            <dl>
              {promotionSavings > 0 ? (
                <>
                  <div>
                    <dt>{t.summarySubtotal}</dt>
                    <dd>{subtotal}</dd>
                  </div>
                  <div className={styles.promotionSavings}>
                    <dt>{t.summaryPromotionSavings}</dt>
                    <dd>
                      −
                      {formatMoney(
                        promotionSavings,
                        reservation.currency,
                        locale,
                      )}
                    </dd>
                  </div>
                </>
              ) : null}
              <div className={styles.summaryTotal}>
                <dt>
                  {paymentRequired
                    ? t.summaryAmountDue
                    : t.summaryReservationTotal}
                </dt>
                <dd>{total}</dd>
              </div>
              <div>
                <dt>{t.summaryStatusLabel}</dt>
                <dd>{statusCopy.label}</dd>
              </div>
              {reservation.fulfillmentMethod ? (
                <div>
                  <dt>{t.summaryFulfillmentLabel}</dt>
                  <dd>
                    {reservation.fulfillmentMethod === "SHIP"
                      ? t.summaryFulfillmentShip
                      : t.summaryFulfillmentPickup}
                  </dd>
                </div>
              ) : null}
            </dl>
            <ul className={styles.itemSummary} aria-label={t.itemsAriaLabel}>
              {reservation.items.map((item) => (
                <li key={item.id}>
                  <span>
                    {b(item.title)}
                    {item.variant ? ` · ${b(item.variant)}` : ""}
                    {item.promotionName ? (
                      <small>
                        {t.promotionRewardLabel(b(item.promotionName))}
                        {item.originalUnitPriceMinorUnits
                          ? ` · ${t.promotionOriginalPriceLabel(
                              formatMoney(
                                item.originalUnitPriceMinorUnits,
                                reservation.currency,
                                locale,
                              ),
                            )}`
                          : ""}
                      </small>
                    ) : null}
                  </span>
                  <strong>
                    ×{item.quantity} ·{" "}
                    {formatMoney(
                      (
                        BigInt(item.unitPriceMinorUnits) * BigInt(item.quantity)
                      ).toString(),
                      reservation.currency,
                      locale,
                    )}
                  </strong>
                </li>
              ))}
            </ul>
            <p>{t.summaryFooter}</p>
          </aside>
        </div>

        <p className={styles.copyStatus} role="status" aria-live="polite">
          {copyError
            ? t.copyError
            : copied
              ? t.copySuccess(copyTargetLabel(copied, t))
              : ""}
        </p>
      </div>
    </main>
  );
}
