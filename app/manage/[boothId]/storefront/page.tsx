import type { CSSProperties } from "react";
import {
  PageHeading,
  adminStyles as styles,
} from "@/components/admin/admin-shell";
import { SubmitButton } from "@/components/admin/form-controls";
import { requireBoothRole } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  readStorefrontDocument,
  storefrontSectionIds,
} from "@/lib/storefront-document";
import { publishStorefrontAction, saveStorefrontAction } from "../actions";

const sectionLabels: Record<(typeof storefrontSectionIds)[number], string> = {
  featured: "Featured spotlight",
  "booth-info": "Booth information",
  browse: "Browse controls",
  catalogue: "Product collection",
  cart: "Shopping cart & payment",
};

export default async function StorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ saved?: string; published?: string }>;
}) {
  const { boothId } = await params;
  const messages = await searchParams;
  const { booth } = await requireBoothRole(boothId, ["OWNER", "ADMIN"]);
  const [config, payment] = await Promise.all([
    db.storefrontConfig.findUnique({ where: { boothId } }),
    db.boothPaymentInstruction.findUnique({ where: { boothId } }),
  ]);
  const document = readStorefrontDocument(config?.draftDocument, booth.name);
  const previewStyle = {
    "--preview-accent": document.accentColor,
  } as CSSProperties;

  return (
    <>
      <PageHeading
        eyebrow="Visual storefront"
        title="Storefront designer"
        description="Shape the public booth, preview the draft, then publish when it is ready."
        actions={
          <>
            <span className={styles.pill}>{document.cornerRadius} corners</span>
            <span className={styles.pill}>
              {document.locale.toUpperCase()} locale
            </span>
          </>
        }
      />

      {messages.saved ? (
        <p className={styles.notice}>
          Draft saved. The public storefront is unchanged until you publish.
        </p>
      ) : null}
      {messages.published ? (
        <p className={styles.notice}>
          Published successfully. Visitors now see this storefront revision.
        </p>
      ) : null}

      <div className={styles.splitLayout}>
        <form
          action={saveStorefrontAction}
          className={`${styles.listPane} ${styles.stack}`}
        >
          <input type="hidden" name="boothId" value={boothId} />
          <div className={styles.panelHeader}>
            <div>
              <h2>Storefront builder</h2>
              <p>Edit safe content and section visibility.</p>
            </div>
            <span className={styles.statusBadge} data-status={booth.status}>
              {booth.status.toLocaleLowerCase()}
            </span>
          </div>

          <label className={styles.field}>
            Booth name
            <input
              name="name"
              defaultValue={document.name}
              required
              maxLength={80}
            />
          </label>
          <label className={styles.field}>
            Tagline
            <input
              name="tagline"
              defaultValue={document.tagline}
              required
              maxLength={140}
            />
          </label>
          <label className={styles.field}>
            Introduction
            <textarea
              name="introduction"
              defaultValue={document.introduction}
              required
            />
          </label>
          <label className={styles.field}>
            Announcement
            <input
              name="announcement"
              defaultValue={document.announcement}
              maxLength={180}
            />
          </label>

          <div className={styles.panelHeader}>
            <div>
              <h3>Creator & event</h3>
              <p>Public booth context.</p>
            </div>
          </div>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Creator name
              <input
                name="creatorName"
                defaultValue={document.creatorName}
                required
              />
            </label>
            <label className={styles.field}>
              Pronouns
              <input
                name="creatorPronouns"
                defaultValue={document.creatorPronouns}
              />
            </label>
            <label className={styles.field}>
              Location
              <input
                name="creatorLocation"
                defaultValue={document.creatorLocation}
              />
            </label>
            <label className={styles.field}>
              Event name
              <input name="eventName" defaultValue={document.eventName} />
            </label>
            <label className={styles.field}>
              Venue
              <input name="eventVenue" defaultValue={document.eventVenue} />
            </label>
            <label className={styles.field}>
              Booth label
              <input
                name="eventBoothLabel"
                defaultValue={document.eventBoothLabel}
              />
            </label>
            <label className={styles.field}>
              Display hours
              <input name="eventHours" defaultValue={document.eventHours} />
            </label>
            <label className={styles.field}>
              Status label
              <input
                name="eventStatusLabel"
                defaultValue={document.eventStatusLabel}
              />
            </label>
          </div>
          <label className={styles.field}>
            Creator bio
            <textarea name="creatorBio" defaultValue={document.creatorBio} />
          </label>
          <label className={styles.field}>
            Fulfilment note
            <textarea
              name="eventFulfillment"
              defaultValue={document.eventFulfillment}
            />
          </label>

          <div className={styles.formGridThree}>
            <label className={styles.field}>
              Theme
              <select name="themePreset" defaultValue={document.themePreset}>
                <option value="lantern">Lantern paper</option>
                <option value="meadow">Meadow mint</option>
                <option value="midnight">Midnight blue</option>
              </select>
            </label>
            <label className={styles.field}>
              Accent
              <input
                name="accentColor"
                type="color"
                defaultValue={document.accentColor}
              />
            </label>
            <label className={styles.field}>
              Corners
              <select name="cornerRadius" defaultValue={document.cornerRadius}>
                <option value="soft">Soft</option>
                <option value="round">Round</option>
                <option value="pill">Pill</option>
              </select>
            </label>
            <label className={styles.field}>
              Locale
              <select name="locale" defaultValue={document.locale}>
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
              </select>
            </label>
          </div>

          <div className={styles.panelHeader}>
            <div>
              <h3>Page sections</h3>
              <p>
                Choose what visitors can see. Order is intentionally stable in
                this release.
              </p>
            </div>
          </div>
          {storefrontSectionIds.map((section, index) => (
            <label className={styles.checkboxField} key={section}>
              <input
                type="checkbox"
                name={`visible-${section}`}
                defaultChecked={document.visibleSections.includes(section)}
              />
              <span>
                {index + 1}. {sectionLabels[section]}
                <small>Public section</small>
              </span>
            </label>
          ))}

          <div className={styles.panelHeader}>
            <div>
              <h3>Manual bank transfer</h3>
              <p>Only public transfer instructions are stored here.</p>
            </div>
          </div>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Bank name
              <input
                name="bankName"
                defaultValue={payment?.bankName ?? "Demo Bank"}
                required
              />
            </label>
            <label className={styles.field}>
              Account name
              <input
                name="accountName"
                defaultValue={payment?.accountName ?? document.creatorName}
                required
              />
            </label>
            <label className={styles.field}>
              Account number
              <input
                name="accountNumber"
                defaultValue={payment?.accountNumber ?? "0000000000"}
                required
              />
            </label>
            <label className={styles.field}>
              Reference template
              <input
                name="transferReferenceTemplate"
                defaultValue={
                  payment?.transferReferenceTemplate ?? "CYF-{ORDER}"
                }
              />
            </label>
          </div>
          <label className={styles.field}>
            Oracle QR object key
            <input
              name="qrObjectKey"
              defaultValue={payment?.qrObjectKey ?? ""}
            />
            <small>
              Images remain in Oracle Object Storage. No storage credentials are
              exposed.
            </small>
          </label>
          <label className={styles.field}>
            Payment instructions
            <textarea
              name="paymentInstructions"
              defaultValue={
                payment?.instructions ??
                "Transfer the exact order total and include the order reference."
              }
              required
            />
          </label>
          <label className={styles.field}>
            Manual-review disclaimer
            <textarea
              name="paymentDisclaimer"
              defaultValue={
                payment?.disclaimer ??
                "Bank transfers are reviewed manually. Cyfurden does not verify or process payment automatically."
              }
              required
            />
          </label>

          <SubmitButton
            className={styles.buttonPrimary}
            pendingLabel="Saving draft…"
          >
            Save draft
          </SubmitButton>
        </form>

        <section className={styles.editorPane}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Draft preview</h2>
              <p>Shared storefront structure · desktop preview</p>
            </div>
            <span className={styles.pill}>
              Draft v{config?.editVersion ?? 1}
            </span>
          </div>
          <div className={styles.previewCanvas} style={previewStyle}>
            <div className={styles.previewWindow}>
              <div className={styles.previewHeader}>
                <strong>{document.name}</strong>
                <span>{document.eventStatusLabel}</span>
              </div>
              <div className={styles.previewHero}>
                <div style={{ borderTop: `4px solid ${document.accentColor}` }}>
                  <p className={styles.eyebrow}>{document.announcement}</p>
                  <h2>{document.tagline}</h2>
                  <p>{document.introduction}</p>
                </div>
                <div>
                  <strong>{document.creatorName}</strong>
                  <p>{document.eventName}</p>
                  <small>
                    {document.eventVenue} · {document.eventBoothLabel}
                  </small>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.stickyActionBar}>
            <form action={publishStorefrontAction}>
              <input type="hidden" name="boothId" value={boothId} />
              <SubmitButton
                className={styles.buttonPrimary}
                pendingLabel="Publishing…"
              >
                Publish storefront
              </SubmitButton>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
