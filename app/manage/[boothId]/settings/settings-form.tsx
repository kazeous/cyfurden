/* eslint-disable @next/next/no-img-element */
"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveBoothSettingsAction,
  type BoothSettingsSaveState,
} from "@/app/manage/[boothId]/actions";
import { BoothIdentityControls } from "@/components/admin/booth-identity-controls";
import { SubmitButton } from "@/components/admin/form-controls";
import type { Locale } from "@/lib/i18n";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
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
  locale,
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
  locale: Locale;
  identity: {
    logoObjectKey: string;
    logoUrl?: string;
    socialLinks: BoothSocialLinks;
  };
  payment: SettingsPaymentDraft;
  uploadConfigured: boolean;
}) {
  const strings = getWorkspaceStrings(locale).settings;
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
      setQrSelectionError(strings.qrTooLarge);
      setQrInputVersion((current) => current + 1);
      return;
    }
    if (file.type && !paymentQrAccept.split(",").includes(file.type)) {
      setQrSelectionError(strings.qrInvalidType);
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
            <p>{strings.publicIdentity}</p>
            <h2 id="booth-info-title">{strings.boothInfo}</h2>
            <span>{strings.boothInfoDescription}</span>
          </div>
          <strong data-status={booth.status}>
            {getWorkspaceStrings(locale).common.boothStatusLabels[
              booth.status as keyof ReturnType<
                typeof getWorkspaceStrings
              >["common"]["boothStatusLabels"]
            ] ?? booth.status}
          </strong>
        </header>

        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>{strings.boothName}</span>
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
            <small>{strings.boothNameHelp}</small>
          </label>
          <label className={styles.field}>
            <span>{strings.publicAddress}</span>
            <span className={styles.readonlyField}>
              cyfurden · /s/{booth.slug}
            </span>
            <small>{strings.publicAddressHelp}</small>
          </label>
        </div>

        <BoothIdentityControls
          boothId={booth.id}
          initialLogoObjectKey={identity.logoObjectKey}
          initialLogoUrl={identity.logoUrl}
          initialSocialLinks={identity.socialLinks}
          uploadConfigured={uploadConfigured}
          locale={locale}
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
            <p>{strings.manualHandoff}</p>
            <h2 id="payment-settings-title">{strings.paymentQr}</h2>
            <span>{strings.paymentDescription}</span>
          </div>
          <strong>{strings.manualOnly}</strong>
        </header>

        <aside className={styles.paymentBoundary}>
          {strings.paymentBoundary}
        </aside>

        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>{strings.paymentLabel}</span>
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
            <span>{strings.receivingBank}</span>
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
              <option value="">{strings.selectBank}</option>
              {vietQrBanks.map((bank) => (
                <option key={bank.bin} value={bank.bin}>
                  {bank.shortName} — {bank.name}
                </option>
              ))}
            </select>
            <small>{strings.bankBinHelp}</small>
          </label>
          <label className={styles.field}>
            <span>{strings.accountName}</span>
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
            <span>{strings.accountNumber}</span>
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
            <span>{strings.transferTemplate}</span>
            <input
              name="transferReferenceTemplate"
              value={payment.transferReferenceTemplate}
              maxLength={120}
              onChange={(event) =>
                updatePayment("transferReferenceTemplate", event.target.value)
              }
            />
            <small>{strings.transferTemplateHelp}</small>
          </label>
        </div>

        <section
          className={styles.qrUploader}
          aria-labelledby="payment-qr-title"
        >
          <div className={styles.qrCopy}>
            <div>
              <strong id="payment-qr-title">{strings.fallbackQr}</strong>
              <small>{strings.fallbackQrHelp}</small>
            </div>
            <span>
              {qrFile
                ? strings.readyToSave
                : hasStoredQr
                  ? strings.uploaded
                  : getWorkspaceStrings(locale).common.optional}
            </span>
          </div>
          <div className={styles.qrWorkspace}>
            <div className={styles.qrPreview}>
              {visibleQrUrl ? (
                <img src={visibleQrUrl} alt={strings.paymentQrPreviewAlt} />
              ) : (
                <span>
                  <strong>QR</strong>
                  <small>
                    {hasStoredQr
                      ? strings.savedImageUnavailable
                      : strings.noFallbackImage}
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
                  {qrFile || hasStoredQr
                    ? strings.replaceImage
                    : strings.chooseImage}
                </label>
                {qrFile ? (
                  <button type="button" onClick={discardQrSelection}>
                    {strings.discardSelection}
                  </button>
                ) : hasStoredQr ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveQr(true);
                      setDirty(true);
                    }}
                  >
                    {strings.removeQr}
                  </button>
                ) : removeQr && payment.qrObjectKey ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveQr(false);
                      setDirty(true);
                    }}
                  >
                    {strings.undoRemove}
                  </button>
                ) : null}
              </div>
              <small>
                {!uploadConfigured
                  ? strings.uploadsUnavailable
                  : strings.generatedPreferred}
              </small>
              {qrSelectionError ? <p role="alert">{qrSelectionError}</p> : null}
            </div>
          </div>
        </section>

        <div className={styles.textareaGrid}>
          <label className={styles.field}>
            <span>{strings.customerInstructions}</span>
            <textarea
              name="paymentInstructions"
              value={payment.instructions}
              required
              maxLength={2_000}
              onChange={(event) =>
                updatePayment("instructions", event.target.value)
              }
            />
            <small>{strings.bilingualHelp}</small>
          </label>
          <label className={styles.field}>
            <span>{strings.manualDisclaimer}</span>
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
        <span>{dirty ? strings.unsaved : strings.upToDate}</span>
        <SubmitButton
          className={styles.saveButton}
          disabled={logoUploadBusy}
          pendingLabel={strings.savingSettings}
        >
          {strings.saveSettings}
        </SubmitButton>
      </div>
    </form>
  );
}
