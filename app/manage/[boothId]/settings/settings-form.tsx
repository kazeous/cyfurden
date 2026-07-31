/* eslint-disable @next/next/no-img-element */
"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveBoothSettingsAction,
  type BoothSettingsSaveState,
} from "@/app/manage/[boothId]/actions";
import { BoothIdentityControls } from "@/components/admin/booth-identity-controls";
import { SubmitButton } from "@/components/admin/form-controls";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { PAYMENT_QR_MAX_BYTES, paymentQrAccept } from "@/lib/payment-qr";
import type { BoothSocialLinks } from "@/lib/shop-settings";
import { resolveVietQrBank, vietQrBanks } from "@/lib/vietqr-banks";
import styles from "./settings.module.css";

export type SettingsPaymentDraft = {
  bankName: string;
  bankCode: string;
  accountName: string;
  accountNumber: string;
  paymentLabel: string;
  transferReferenceTemplate: string;
  qrObjectKey: string;
  instructions: string;
  disclaimer: string;
};

const initialState: BoothSettingsSaveState = { error: null };

export function SettingsForm({
  booth,
  identity,
  payment: initialPayment,
  uploadConfigured,
}: {
  booth: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  identity: {
    logoObjectKey: string;
    logoUrl?: string;
    socialLinks: BoothSocialLinks;
  };
  payment: SettingsPaymentDraft;
  uploadConfigured: boolean;
}) {
  const [state, action] = useActionState(saveBoothSettingsAction, initialState);
  const [payment, setPayment] = useState(() => {
    const bank = resolveVietQrBank(
      initialPayment.bankCode,
      initialPayment.bankName,
    );
    return bank
      ? {
          ...initialPayment,
          bankName: bank.shortName,
          bankCode: bank.bin,
        }
      : initialPayment;
  });
  const [boothName, setBoothName] = useState(booth.name);
  const [dirty, setDirty] = useState(false);
  const [logoUploadBusy, setLogoUploadBusy] = useState(false);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrInputVersion, setQrInputVersion] = useState(0);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrSelectionError, setQrSelectionError] = useState<string | null>(null);
  const [removeQr, setRemoveQr] = useState(false);

  useEffect(
    () => () => {
      if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
    },
    [qrPreviewUrl],
  );

  const storedQrUrl = payment.qrObjectKey
    ? resolveOracleImageUrl({ objectKey: payment.qrObjectKey })
    : undefined;
  const visibleQrUrl = qrPreviewUrl || (!removeQr ? storedQrUrl : undefined);
  const hasStoredQr = Boolean(payment.qrObjectKey) && !removeQr;

  const updatePayment = <Key extends keyof SettingsPaymentDraft>(
    key: Key,
    value: SettingsPaymentDraft[Key],
  ) => {
    setPayment((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  function chooseQrImage(file: File | undefined) {
    setQrSelectionError(null);
    if (!file) return;
    if (file.size > PAYMENT_QR_MAX_BYTES) {
      setQrSelectionError("QR images must be 5 MB or smaller.");
      setQrInputVersion((current) => current + 1);
      return;
    }
    if (file.type && !paymentQrAccept.split(",").includes(file.type)) {
      setQrSelectionError("Choose a PNG, JPEG, or WebP image.");
      setQrInputVersion((current) => current + 1);
      return;
    }
    if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
    setQrFile(file);
    setQrPreviewUrl(URL.createObjectURL(file));
    setRemoveQr(false);
    setDirty(true);
  }

  function discardQrSelection() {
    if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
    setQrFile(null);
    setQrPreviewUrl(null);
    setQrSelectionError(null);
    setQrInputVersion((current) => current + 1);
    setDirty(true);
  }

  return (
    <form action={action} className={styles.settingsForm}>
      <input type="hidden" name="boothId" value={booth.id} />
      <input type="hidden" name="removeQr" value={String(removeQr)} />

      <section
        className={styles.settingsCard}
        aria-labelledby="booth-info-title"
      >
        <header className={styles.cardHeader}>
          <span className={styles.cardIndex}>01</span>
          <div>
            <p>Public identity</p>
            <h2 id="booth-info-title">Booth info</h2>
            <span>
              Keep the workspace identity, public address, logo, and social
              links together.
            </span>
          </div>
          <strong data-status={booth.status}>
            {booth.status.toLowerCase()}
          </strong>
        </header>

        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>Booth name</span>
            <input
              name="boothName"
              value={boothName}
              required
              minLength={2}
              maxLength={80}
              onChange={(event) => {
                setBoothName(event.target.value);
                setDirty(true);
              }}
            />
            <small>
              This updates the workspace name and storefront draft. Publish the
              draft when visitors should see the new name.
            </small>
          </label>
          <label className={styles.field}>
            <span>Public booth address</span>
            <span className={styles.readonlyField}>
              cyfurden · /s/{booth.slug}
            </span>
            <small>
              The slug is permanent so printed convention links keep working.
            </small>
          </label>
        </div>

        <BoothIdentityControls
          boothId={booth.id}
          initialLogoObjectKey={identity.logoObjectKey}
          initialLogoUrl={identity.logoUrl}
          initialSocialLinks={identity.socialLinks}
          uploadConfigured={uploadConfigured}
          onBusyChange={setLogoUploadBusy}
          onDirty={() => setDirty(true)}
        />
      </section>

      <section
        className={styles.settingsCard}
        aria-labelledby="payment-settings-title"
      >
        <header className={styles.cardHeader}>
          <span className={styles.cardIndex}>02</span>
          <div>
            <p>Manual transfer handoff</p>
            <h2 id="payment-settings-title">Payment &amp; QR</h2>
            <span>
              Configure the receiving account shown only after a reservation is
              created. Cyfurden never verifies a transfer automatically.
            </span>
          </div>
          <strong>Manual only</strong>
        </header>

        <aside className={styles.paymentBoundary}>
          Generated VietQR uses the selected bank and exact reservation
          reference. An uploaded QR remains an optional fallback image; neither
          path connects to a payment gateway.
        </aside>

        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>Payment label</span>
            <input
              name="paymentLabel"
              value={payment.paymentLabel}
              required
              maxLength={80}
              onChange={(event) =>
                updatePayment("paymentLabel", event.target.value)
              }
            />
          </label>
          <label className={styles.field}>
            <span>Receiving bank</span>
            <select
              name="bankCode"
              value={payment.bankCode}
              required
              onChange={(event) => {
                const bank = resolveVietQrBank(event.target.value);
                setPayment((current) => ({
                  ...current,
                  bankCode: bank?.bin ?? "",
                  bankName: bank?.shortName ?? "",
                }));
                setDirty(true);
              }}
            >
              <option value="">Select a bank</option>
              {vietQrBanks.map((bank) => (
                <option key={bank.bin} value={bank.bin}>
                  {bank.shortName} — {bank.name}
                </option>
              ))}
            </select>
            <small>The bank BIN is resolved locally for VietQR.</small>
          </label>
          <label className={styles.field}>
            <span>Account name</span>
            <input
              name="accountName"
              value={payment.accountName}
              required
              maxLength={120}
              onChange={(event) =>
                updatePayment("accountName", event.target.value)
              }
            />
          </label>
          <label className={styles.field}>
            <span>Account number</span>
            <input
              name="accountNumber"
              value={payment.accountNumber}
              required
              maxLength={80}
              inputMode="numeric"
              onChange={(event) =>
                updatePayment("accountNumber", event.target.value)
              }
            />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>Transfer message template</span>
            <input
              name="transferReferenceTemplate"
              value={payment.transferReferenceTemplate}
              maxLength={120}
              onChange={(event) =>
                updatePayment("transferReferenceTemplate", event.target.value)
              }
            />
            <small>
              Supports {"{code}"}, {"{item}"}, and {"{amount}"}. Long VietQR
              messages safely fall back to the reservation code.
            </small>
          </label>
        </div>

        <section
          className={styles.qrUploader}
          aria-labelledby="payment-qr-title"
        >
          <div className={styles.qrCopy}>
            <div>
              <strong id="payment-qr-title">Fallback QR image</strong>
              <small>
                PNG, JPEG, or WebP up to 5 MB, stored in Oracle Object Storage
                when you save.
              </small>
            </div>
            <span>
              {qrFile ? "Ready to save" : hasStoredQr ? "Uploaded" : "Optional"}
            </span>
          </div>
          <div className={styles.qrWorkspace}>
            <div className={styles.qrPreview}>
              {visibleQrUrl ? (
                <img src={visibleQrUrl} alt="Payment QR preview" />
              ) : (
                <span>
                  <strong>QR</strong>
                  <small>
                    {hasStoredQr
                      ? "Image saved; public delivery URL unavailable here."
                      : "No fallback image"}
                  </small>
                </span>
              )}
            </div>
            <div className={styles.qrControls}>
              <input
                key={qrInputVersion}
                id="settings-payment-qr"
                className={styles.srOnly}
                type="file"
                name="qrImage"
                accept={paymentQrAccept}
                disabled={!uploadConfigured}
                onChange={(event) => chooseQrImage(event.target.files?.[0])}
              />
              <div>
                <label
                  className={
                    uploadConfigured
                      ? styles.uploadButton
                      : styles.uploadButtonDisabled
                  }
                  htmlFor="settings-payment-qr"
                  aria-disabled={!uploadConfigured}
                >
                  {qrFile || hasStoredQr ? "Replace image" : "Choose image"}
                </label>
                {qrFile ? (
                  <button type="button" onClick={discardQrSelection}>
                    Discard selection
                  </button>
                ) : hasStoredQr ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveQr(true);
                      setDirty(true);
                    }}
                  >
                    Remove QR
                  </button>
                ) : removeQr && payment.qrObjectKey ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveQr(false);
                      setDirty(true);
                    }}
                  >
                    Undo remove
                  </button>
                ) : null}
              </div>
              <small>
                {!uploadConfigured
                  ? "Uploads are unavailable until Oracle Object Storage is configured."
                  : "Generated VietQR remains preferred when bank details are complete."}
              </small>
              {qrSelectionError ? <p role="alert">{qrSelectionError}</p> : null}
            </div>
          </div>
        </section>

        <div className={styles.textareaGrid}>
          <label className={styles.field}>
            <span>Customer payment instructions</span>
            <textarea
              name="paymentInstructions"
              value={payment.instructions}
              required
              maxLength={2_000}
              onChange={(event) =>
                updatePayment("instructions", event.target.value)
              }
            />
            <small>Inline [en]…[/en][vi]…[/vi] content is supported.</small>
          </label>
          <label className={styles.field}>
            <span>Manual-review disclaimer</span>
            <textarea
              name="paymentDisclaimer"
              value={payment.disclaimer}
              required
              maxLength={1_000}
              onChange={(event) =>
                updatePayment("disclaimer", event.target.value)
              }
            />
          </label>
        </div>
      </section>

      {state.error ? (
        <p className={styles.formError} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className={styles.saveBar}>
        <span>{dirty ? "Unsaved settings" : "Settings are up to date"}</span>
        <SubmitButton
          className={styles.saveButton}
          disabled={logoUploadBusy}
          pendingLabel="Saving settings…"
        >
          Save settings
        </SubmitButton>
      </div>
    </form>
  );
}
