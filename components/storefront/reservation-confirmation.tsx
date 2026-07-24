/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import {
  submitCustomerTransferReferenceAction,
  type CustomerTransferReferenceState,
} from "@/app/s/[slug]/reservation/[code]/actions";
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
  totalMinorUnits: string;
  transferReference: string;
  customerTransferReference: string | null;
  idempotencyKey: string;
  items: Array<{
    id: string;
    title: string;
    variant: string | null;
    quantity: number;
    unitPriceMinorUnits: string;
  }>;
};

type CopyTarget = "reservation" | "account" | "reference";

const targetLabel: Record<CopyTarget, string> = {
  reservation: "reservation number",
  account: "account number",
  reference: "transfer reference",
};

const reservationStatusCopy: Record<
  ReservationDetails["status"],
  { heading: string; description: string; label: string }
> = {
  PENDING: {
    heading: "Your items are reserved.",
    description:
      "Keep the number below. You will need it for this reservation and when contacting the booth owner.",
    label: "Awaiting manual transfer review",
  },
  CONFIRMED: {
    heading: "Your transfer was confirmed.",
    description:
      "The booth owner marked this reservation as confirmed after reviewing payment manually.",
    label: "Confirmed manually",
  },
  FULFILLED: {
    heading: "Your reservation was fulfilled.",
    description:
      "The booth owner marked every item in this reservation as fulfilled.",
    label: "Fulfilled",
  },
  CANCELLED: {
    heading: "This reservation was cancelled.",
    description:
      "Do not send a transfer for this reservation. Contact the booth owner if you believe this is a mistake.",
    label: "Cancelled",
  },
  EXPIRED: {
    heading: "This reservation expired.",
    description:
      "Do not send a transfer for this reservation. Return to the booth to check current availability.",
    label: "Expired",
  },
};

const initialReferenceState: CustomerTransferReferenceState = {
  status: "idle",
  message: "",
};

function formatMoney(minorUnits: string, currency: string) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(BigInt(minorUnits) / BigInt(100));
}

export function ReservationConfirmation({
  boothSlug,
  document,
  reservation,
  payment,
}: {
  boothSlug: string;
  document: StorefrontDocument;
  reservation: ReservationDetails;
  payment: PaymentDetails | null;
}) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [referenceState, referenceAction, referencePending] = useActionState(
    submitCustomerTransferReferenceAction,
    initialReferenceState,
  );
  const total = formatMoney(reservation.totalMinorUnits, reservation.currency);
  const statusCopy = reservationStatusCopy[reservation.status];
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
            <strong>{document.name}</strong>
            <small>
              {document.eventName} · {document.eventBoothLabel}
            </small>
          </span>
        </a>
        <a className={styles.backLink} href={`/s/${boothSlug}`}>
          Back to booth
        </a>
      </header>

      <div className={styles.content}>
        <section className={styles.receipt} aria-labelledby="receipt-heading">
          <div className={styles.receiptCopy}>
            <p className={styles.eyebrow}>Reservation received</p>
            <h1 id="receipt-heading">{statusCopy.heading}</h1>
            <p>{statusCopy.description}</p>
          </div>
          <div className={styles.referenceBlock}>
            <span>Reservation number</span>
            <strong>{reservation.code}</strong>
            <button
              type="button"
              onClick={() => copy("reservation", reservation.code)}
              data-copied={copied === "reservation"}
            >
              {copied === "reservation" ? "Copied" : "Copy number"}
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
                {payment?.paymentLabel || "Manual bank transfer"}
              </p>
              <h2 id="payment-heading">
                {paymentRequired
                  ? "Transfer to finish your reservation"
                  : statusCopy.heading}
              </h2>
              <p>
                {paymentRequired
                  ? "Payment is checked by the booth owner. Cyfurden does not verify payment automatically."
                  : statusCopy.description}
              </p>
            </div>

            {paymentRequired && payment ? (
              <>
                <ol className={styles.steps}>
                  <li>
                    <span>1</span>
                    Scan the QR code or use the bank account below.
                  </li>
                  <li>
                    <span>2</span>
                    Transfer the exact reservation total.
                  </li>
                  <li>
                    <span>3</span>
                    Include the transfer reference exactly as shown.
                  </li>
                </ol>

                <div className={styles.paymentGrid}>
                  <div className={styles.qrPanel}>
                    {payment.qrUrl ? (
                      <>
                        <img
                          src={payment.qrUrl}
                          alt={`Bank transfer QR code for ${payment.accountName}`}
                        />
                        {payment.qrSource ? (
                          <small>{payment.qrSource}</small>
                        ) : null}
                      </>
                    ) : (
                      <div className={styles.qrFallback}>
                        <strong>QR code unavailable</strong>
                        <span>Use the bank details beside this panel.</span>
                      </div>
                    )}
                  </div>

                  <dl className={styles.bankDetails}>
                    {hasBankAccount ? (
                      <>
                        <div>
                          <dt>Bank</dt>
                          <dd>{payment.bankName}</dd>
                        </div>
                        <div>
                          <dt>Account name</dt>
                          <dd>{payment.accountName}</dd>
                        </div>
                        <div>
                          <dt>Account number</dt>
                          <dd className={styles.copyValue}>
                            <strong>{payment.accountNumber}</strong>
                            <button
                              type="button"
                              onClick={() =>
                                copy("account", payment.accountNumber)
                              }
                              data-copied={copied === "account"}
                            >
                              {copied === "account" ? "Copied" : "Copy"}
                            </button>
                          </dd>
                        </div>
                      </>
                    ) : null}
                    <div>
                      <dt>Reservation total</dt>
                      <dd className={styles.total}>{total}</dd>
                    </div>
                    <div>
                      <dt>Transfer reference</dt>
                      <dd className={styles.copyValue}>
                        <strong>{reservation.transferReference}</strong>
                        <button
                          type="button"
                          onClick={() =>
                            copy("reference", reservation.transferReference)
                          }
                          data-copied={copied === "reference"}
                        >
                          {copied === "reference" ? "Copied" : "Copy"}
                        </button>
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className={styles.ownerNote}>
                  <strong>Booth instructions</strong>
                  <p>{payment.instructions}</p>
                </div>
                <form action={referenceAction} className={styles.referenceForm}>
                  <strong>Submit your bank transaction reference</strong>
                  <p>
                    After transferring, enter the reference from your bank
                    receipt so the booth owner can match it manually.
                  </p>
                  <input type="hidden" name="slug" value={boothSlug} />
                  <input type="hidden" name="code" value={reservation.code} />
                  <label>
                    Bank transaction reference
                    <input
                      name="customerTransferReference"
                      defaultValue={reservation.customerTransferReference ?? ""}
                      maxLength={120}
                      required
                      disabled={referencePending}
                    />
                  </label>
                  <button type="submit" disabled={referencePending}>
                    {referencePending ? "Submitting..." : "Submit reference"}
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
                <p className={styles.disclaimer}>{payment.disclaimer}</p>
              </>
            ) : paymentRequired ? (
              <div className={styles.paymentUnavailable}>
                <strong>Payment instructions are not available yet.</strong>
                <p>
                  Keep your reservation number and contact the booth owner
                  before sending a transfer.
                </p>
              </div>
            ) : (
              <div className={styles.paymentUnavailable}>
                <strong>No transfer action is required.</strong>
                <p>{statusCopy.description}</p>
              </div>
            )}
          </section>

          <aside className={styles.summary} aria-labelledby="summary-heading">
            <p className={styles.eyebrow}>Reservation summary</p>
            <h2 id="summary-heading">What happens next</h2>
            <dl>
              <div>
                <dt>{paymentRequired ? "Amount due" : "Reservation total"}</dt>
                <dd>{total}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{statusCopy.label}</dd>
              </div>
            </dl>
            <ul className={styles.itemSummary} aria-label="Reserved items">
              {reservation.items.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.title}
                    {item.variant ? ` · ${item.variant}` : ""}
                  </span>
                  <strong>
                    ×{item.quantity} ·{" "}
                    {formatMoney(
                      (
                        BigInt(item.unitPriceMinorUnits) * BigInt(item.quantity)
                      ).toString(),
                      reservation.currency,
                    )}
                  </strong>
                </li>
              ))}
            </ul>
            <p>
              {paymentRequired
                ? "After transferring, keep your bank receipt. The booth owner will review the payment outside Cyfurden and update the reservation manually."
                : statusCopy.description}
            </p>
          </aside>
        </div>

        <p className={styles.copyStatus} role="status" aria-live="polite">
          {copyError
            ? "Copying was blocked by your browser. Select the value and copy it manually."
            : copied
              ? `Copied ${targetLabel[copied]}.`
              : ""}
        </p>
      </div>
    </main>
  );
}
