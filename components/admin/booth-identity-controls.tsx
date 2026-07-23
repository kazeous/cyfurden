/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { type BoothSocialLinks, socialPlatforms } from "@/lib/shop-settings";
import { PAYMENT_QR_MAX_BYTES, paymentQrAccept } from "@/lib/payment-qr";
import { createSocialQrDataUrl } from "@/lib/social-qr";
import styles from "./storefront-designer.module.css";

type PresignResponse = {
  error?: string;
  objectKey?: string;
  uploadUrl?: string;
};

function SocialQrPreview({
  label,
  logoUrl,
  url,
}: {
  label: string;
  logoUrl?: string;
  url: string;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const normalized = url.trim();
    if (!normalized) {
      return () => {
        active = false;
      };
    }

    createSocialQrDataUrl(normalized)
      .then((value) => {
        if (active) setQrUrl(value);
      })
      .catch(() => {
        if (active) setQrUrl(null);
      });
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <div className={styles.socialQrPreview}>
      {qrUrl ? (
        <span className={styles.socialQrImage}>
          <img src={qrUrl} alt={`${label} profile QR code preview`} />
          <span className={styles.socialQrLogo} aria-hidden="true">
            {logoUrl ? <img src={logoUrl} alt="" /> : "C"}
          </span>
        </span>
      ) : (
        <span className={styles.socialQrEmpty} aria-hidden="true">
          QR
        </span>
      )}
      <small>
        {url ? "High-correction QR preview" : "Add a link to generate"}
      </small>
    </div>
  );
}

export function BoothIdentityControls({
  boothId,
  initialLogoObjectKey,
  initialLogoUrl,
  initialSocialLinks,
  uploadConfigured,
  onBusyChange,
  onDirty,
}: {
  boothId: string;
  initialLogoObjectKey: string;
  initialLogoUrl?: string;
  initialSocialLinks: BoothSocialLinks;
  uploadConfigured: boolean;
  onBusyChange: (busy: boolean) => void;
  onDirty: () => void;
}) {
  const [logoObjectKey, setLogoObjectKey] = useState(initialLogoObjectKey);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] = useState(initialSocialLinks);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const visibleLogoUrl = logoPreviewUrl ?? initialLogoUrl;

  useEffect(
    () => () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    },
    [logoPreviewUrl],
  );

  const setUploadBusy = (busy: boolean) => {
    setUploading(busy);
    onBusyChange(busy);
  };

  const chooseLogo = async (file: File | undefined) => {
    setUploadError(null);
    setUploadMessage(null);
    if (!file) return;
    if (file.size > PAYMENT_QR_MAX_BYTES) {
      setUploadError("Logo images must be 5 MB or smaller.");
      return;
    }
    if (!paymentQrAccept.split(",").includes(file.type)) {
      setUploadError("Choose a PNG, JPEG, or WebP logo image.");
      return;
    }

    setUploadBusy(true);
    try {
      const response = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boothId,
          purpose: "logo",
          contentType: file.type,
          contentLength: file.size,
        }),
      });
      const presign = (await response.json()) as PresignResponse;
      if (!response.ok || !presign.uploadUrl || !presign.objectKey) {
        throw new Error(presign.error || "The logo upload could not start.");
      }

      const upload = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!upload.ok) {
        throw new Error("Oracle Object Storage rejected the logo upload.");
      }

      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl(URL.createObjectURL(file));
      setLogoObjectKey(presign.objectKey);
      setUploadMessage(
        "Logo uploaded. Save the draft to attach it to this booth.",
      );
      onDirty();
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "The logo could not be uploaded.",
      );
    } finally {
      setUploadBusy(false);
    }
  };

  const removeLogo = () => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPreviewUrl(null);
    setLogoObjectKey("");
    setUploadMessage("Logo will be removed when the draft is saved.");
    setUploadError(null);
    onDirty();
  };

  return (
    <div className={styles.identitySettings}>
      <input type="hidden" name="logoObjectKey" value={logoObjectKey} />
      <section
        className={styles.logoUploader}
        aria-labelledby="booth-logo-title"
      >
        <div className={styles.identitySectionHeading}>
          <div>
            <strong id="booth-logo-title">Booth logo</strong>
            <small>
              PNG, JPEG, or WebP up to 5 MB. Uploads use a short-lived,
              booth-scoped Oracle URL.
            </small>
          </div>
          <span>{logoObjectKey ? "Configured" : "Optional"}</span>
        </div>
        <div className={styles.logoUploadGrid}>
          <span className={styles.logoPreview}>
            {visibleLogoUrl ? (
              <img src={visibleLogoUrl} alt="Booth logo preview" />
            ) : (
              "C"
            )}
          </span>
          <div className={styles.logoActions}>
            <label
              className={
                uploadConfigured && !uploading
                  ? styles.qrUploadButton
                  : styles.qrUploadDisabled
              }
              aria-disabled={!uploadConfigured || uploading}
            >
              {uploading
                ? "Uploading…"
                : logoObjectKey
                  ? "Replace logo"
                  : "Choose logo"}
              <input
                className={styles.srOnly}
                type="file"
                accept={paymentQrAccept}
                disabled={!uploadConfigured || uploading}
                onChange={(event) => chooseLogo(event.target.files?.[0])}
              />
            </label>
            {logoObjectKey ? (
              <button type="button" onClick={removeLogo} disabled={uploading}>
                Remove logo
              </button>
            ) : null}
          </div>
        </div>
        {!uploadConfigured ? (
          <p className={styles.qrHelp}>
            Logo uploads are unavailable until Oracle Object Storage and its
            public delivery origin are configured.
          </p>
        ) : null}
        {uploadError ? (
          <p className={styles.formError} role="alert">
            {uploadError}
          </p>
        ) : null}
        {uploadMessage ? (
          <p className={styles.uploadMessage} role="status">
            {uploadMessage}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="social-links-title">
        <div className={styles.identitySectionHeading}>
          <div>
            <strong id="social-links-title">Social links and QR codes</strong>
            <small>
              Use complete HTTPS profile URLs. Each QR uses high error
              correction and centers the booth mark when available.
            </small>
          </div>
          <span>
            {Object.values(socialLinks).filter(Boolean).length} configured
          </span>
        </div>
        <div className={styles.socialLinkList}>
          {socialPlatforms.map(({ id, label }) => (
            <label className={styles.socialLinkRow} key={id}>
              <span className={styles.socialLinkCopy}>
                <strong>{label}</strong>
                <input
                  type="url"
                  name={`social-${id}`}
                  value={socialLinks[id]}
                  maxLength={2_048}
                  placeholder={`https://${id}.com/your-profile`}
                  onChange={(event) => {
                    setSocialLinks((current) => ({
                      ...current,
                      [id]: event.target.value,
                    }));
                    onDirty();
                  }}
                />
              </span>
              <SocialQrPreview
                label={label}
                logoUrl={visibleLogoUrl}
                url={socialLinks[id]}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
