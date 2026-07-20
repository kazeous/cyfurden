/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { StorefrontDocument } from "@/lib/storefront-document";
import styles from "./reservation-confirmation.module.css";

type PaymentDetails = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  disclaimer: string;
  qrUrl?: string;
};

type ReservationDetails = {
  code: string;
  currency: string;
  totalMinorUnits: string;
  transferReference: string;
};

type CopyTarget = "reservation" | "account" | "reference";

const targetLabel: Record<CopyTarget, string> = {
  reservation: "reservation number",
  account: "account number",
  reference: "transfer reference",
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
  const total = formatMoney(reservation.totalMinorUnits, reservation.currency);

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
            <h1 id="receipt-heading">Your items are reserved.</h1>
            <p>
              Keep the number below. You will need it for this reservation and
              when contacting the booth owner.
            </p>
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
              <p className={styles.eyebrow}>Manual bank transfer</p>
              <h2 id="payment-heading">Transfer to finish your reservation</h2>
              <p>
                Payment is checked by the booth owner. Cyfurden does not verify
                payment automatically.
              </p>
            </div>

            {payment ? (
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
                      <img
                        src={payment.qrUrl}
                        alt={`Bank transfer QR code for ${payment.accountName}`}
                      />
                    ) : (
                      <div className={styles.qrFallback}>
                        <strong>QR code unavailable</strong>
                        <span>Use the bank details beside this panel.</span>
                      </div>
                    )}
                  </div>

                  <dl className={styles.bankDetails}>
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
                          onClick={() => copy("account", payment.accountNumber)}
                          data-copied={copied === "account"}
                        >
                          {copied === "account" ? "Copied" : "Copy"}
                        </button>
                      </dd>
                    </div>
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
                <p className={styles.disclaimer}>{payment.disclaimer}</p>
              </>
            ) : (
              <div className={styles.paymentUnavailable}>
                <strong>Payment instructions are not available yet.</strong>
                <p>
                  Keep your reservation number and contact the booth owner
                  before sending a transfer.
                </p>
              </div>
            )}
          </section>

          <aside className={styles.summary} aria-labelledby="summary-heading">
            <p className={styles.eyebrow}>Reservation summary</p>
            <h2 id="summary-heading">What happens next</h2>
            <dl>
              <div>
                <dt>Amount due</dt>
                <dd>{total}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Awaiting manual transfer review</dd>
              </div>
            </dl>
            <p>
              After transferring, keep your bank receipt. The booth owner will
              review the payment outside Cyfurden and update the reservation
              manually.
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
