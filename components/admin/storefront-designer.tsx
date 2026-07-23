/* eslint-disable @next/next/no-img-element */
"use client";

import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  publishStorefrontAction,
  saveStorefrontAction,
} from "@/app/manage/[boothId]/actions";
import { BoothIdentityControls } from "./booth-identity-controls";
import { resolveOracleImageUrl } from "@/lib/oracle-images";
import { PAYMENT_QR_MAX_BYTES, paymentQrAccept } from "@/lib/payment-qr";
import type { BoothSocialLinks } from "@/lib/shop-settings";
import {
  type StorefrontDocument,
  storefrontCornerRadiusPixels,
  storefrontSectionIds,
} from "@/lib/storefront-document";
import { SubmitButton } from "./form-controls";
import styles from "./storefront-designer.module.css";

type SectionId = (typeof storefrontSectionIds)[number];
type EditorTab = "layout" | "content" | "style";
type PreviewMode = "desktop" | "phone";

export type StorefrontPaymentDraft = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  paymentLabel: string;
  transferReferenceTemplate: string;
  qrObjectKey: string;
  instructions: string;
  disclaimer: string;
};

const sectionMeta: Record<
  SectionId,
  {
    label: string;
    description: string;
    lane: "wide" | "side";
    icon: string;
    previewRows: number;
  }
> = {
  featured: {
    label: "Featured spotlight",
    description: "Announcement, headline, and welcome copy",
    lane: "wide",
    icon: "F",
    previewRows: 12,
  },
  "booth-info": {
    label: "Booth information",
    description: "Creator, convention, location, and hours",
    lane: "side",
    icon: "I",
    previewRows: 12,
  },
  browse: {
    label: "Browse controls",
    description: "Search, filter, and collection controls",
    lane: "wide",
    icon: "B",
    previewRows: 5,
  },
  catalogue: {
    label: "Product collection",
    description: "The public product catalogue",
    lane: "wide",
    icon: "P",
    previewRows: 13,
  },
  cart: {
    label: "Shopping cart",
    description: "Cart and post-reservation payment setup",
    lane: "side",
    icon: "C",
    previewRows: 12,
  },
};

const editorTabs = ["layout", "content", "style"] as const;

function ControlIcon({
  name,
}: {
  name:
    | "content"
    | "drag"
    | "down"
    | "hidden"
    | "layout"
    | "style"
    | "up"
    | "visible";
}) {
  if (name === "drag") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="5" cy="4" r="1.2" />
        <circle cx="11" cy="4" r="1.2" />
        <circle cx="5" cy="8" r="1.2" />
        <circle cx="11" cy="8" r="1.2" />
        <circle cx="5" cy="12" r="1.2" />
        <circle cx="11" cy="12" r="1.2" />
      </svg>
    );
  }

  if (name === "up" || name === "down") {
    const points = name === "up" ? "3 10 8 5 13 10" : "3 6 8 11 13 6";
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <polyline points={points} />
      </svg>
    );
  }

  if (name === "visible" || name === "hidden") {
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <path d="M2 9s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4Z" />
        <circle cx="9" cy="9" r="2" />
        {name === "hidden" ? <path d="m3 3 12 12" /> : null}
      </svg>
    );
  }

  if (name === "layout") {
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <rect x="2.5" y="3" width="5" height="12" rx="1" />
        <rect x="10.5" y="3" width="5" height="5" rx="1" />
        <rect x="10.5" y="10.5" width="5" height="4.5" rx="1" />
      </svg>
    );
  }

  if (name === "content") {
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <path d="M4 4h10M4 9h10M4 14h7" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="6" />
      <circle cx="9" cy="9" r="2" />
    </svg>
  );
}

const documentFieldNames = [
  "name",
  "tagline",
  "introduction",
  "announcement",
  "creatorName",
  "creatorPronouns",
  "creatorLocation",
  "creatorBio",
  "eventName",
  "eventVenue",
  "eventBoothLabel",
  "eventHours",
  "eventStatusLabel",
  "eventFulfillment",
  "locale",
  "themePreset",
  "accentColor",
  "cornerRadius",
] as const satisfies ReadonlyArray<keyof StorefrontDocument>;

const paymentFieldNames = [
  "bankName",
  "accountName",
  "accountNumber",
  "paymentLabel",
  "transferReferenceTemplate",
  "instructions",
  "disclaimer",
] as const satisfies ReadonlyArray<keyof StorefrontPaymentDraft>;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function EmptyPreview({
  icon,
  title,
  copy,
}: {
  icon: string;
  title: string;
  copy: string;
}) {
  return (
    <div className={styles.previewEmpty}>
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <small>{copy}</small>
    </div>
  );
}

export function StorefrontDesigner({
  boothId,
  boothStatus,
  document: initialDocument,
  payment: initialPayment,
  identity,
  editVersion,
  qrUploadConfigured,
  productCount,
  featuredCount,
}: {
  boothId: string;
  boothStatus: string;
  document: StorefrontDocument;
  payment: StorefrontPaymentDraft;
  identity: {
    logoObjectKey: string;
    logoUrl?: string;
    socialLinks: BoothSocialLinks;
  };
  editVersion: number;
  qrUploadConfigured: boolean;
  productCount: number;
  featuredCount: number;
}) {
  const [document, setDocument] = useState(initialDocument);
  const [payment, setPayment] = useState(initialPayment);
  const [selectedSection, setSelectedSection] = useState<SectionId>(
    initialDocument.visibleSections[0] ?? "featured",
  );
  const [tab, setTab] = useState<EditorTab>("layout");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [draggedSection, setDraggedSection] = useState<SectionId | null>(null);
  const [dropTarget, setDropTarget] = useState<SectionId | null>(null);
  const [dirty, setDirty] = useState(false);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrInputVersion, setQrInputVersion] = useState(0);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrSelectionError, setQrSelectionError] = useState<string | null>(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [logoUploadBusy, setLogoUploadBusy] = useState(false);
  const [saveState, saveAction] = useActionState(saveStorefrontAction, {
    error: null,
  });
  const [announcement, setAnnouncement] = useState(
    "Select a block in the preview to edit it.",
  );

  useEffect(
    () => () => {
      if (qrPreviewUrl) URL.revokeObjectURL(qrPreviewUrl);
    },
    [qrPreviewUrl],
  );

  const selectedMeta = sectionMeta[selectedSection];
  const storedQrUrl = payment.qrObjectKey
    ? resolveOracleImageUrl({ objectKey: payment.qrObjectKey })
    : undefined;
  const visibleQrUrl = qrPreviewUrl || (!removeQr ? storedQrUrl : undefined);
  const hasStoredQr = Boolean(payment.qrObjectKey) && !removeQr;
  const visibleOrder = useMemo(
    () =>
      document.sectionOrder.filter((section) =>
        document.visibleSections.includes(section),
      ),
    [document.sectionOrder, document.visibleSections],
  );
  const previewStyle = {
    "--designer-accent": document.accentColor,
    "--designer-radius": `${storefrontCornerRadiusPixels[document.cornerRadius]}px`,
  } as CSSProperties;

  const updateDocument = <Key extends keyof StorefrontDocument>(
    key: Key,
    value: StorefrontDocument[Key],
  ) => {
    setDocument((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const updatePayment = <Key extends keyof StorefrontPaymentDraft>(
    key: Key,
    value: StorefrontPaymentDraft[Key],
  ) => {
    setPayment((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const chooseQrImage = (file: File | undefined) => {
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

    setQrFile(file);
    setQrPreviewUrl(URL.createObjectURL(file));
    setRemoveQr(false);
    setDirty(true);
  };

  const discardQrSelection = () => {
    setQrFile(null);
    setQrPreviewUrl(null);
    setQrSelectionError(null);
    setQrInputVersion((current) => current + 1);
    setDirty(true);
  };

  const selectSection = (section: SectionId) => {
    setSelectedSection(section);
    setTab("content");
    setAnnouncement(`${sectionMeta[section].label} selected for editing.`);
  };

  const focusEditorTab = (nextTab: EditorTab) => {
    setTab(nextTab);
    globalThis.requestAnimationFrame(() => {
      globalThis.document.getElementById(`storefront-${nextTab}-tab`)?.focus();
    });
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: EditorTab,
  ) => {
    const currentIndex = editorTabs.indexOf(currentTab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % editorTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + editorTabs.length) % editorTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = editorTabs.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    focusEditorTab(editorTabs[nextIndex]);
  };

  const reorderSection = (
    source: SectionId,
    target: SectionId,
    placement: "before" | "after",
  ) => {
    if (source === target) return;
    const nextOrder = document.sectionOrder.filter((item) => item !== source);
    const targetIndex =
      nextOrder.indexOf(target) + (placement === "after" ? 1 : 0);
    nextOrder.splice(targetIndex, 0, source);
    updateDocument("sectionOrder", nextOrder);
    setAnnouncement(
      `${sectionMeta[source].label} moved ${placement} ${sectionMeta[target].label}.`,
    );
  };

  const moveSection = (section: SectionId, delta: -1 | 1) => {
    const currentIndex = document.sectionOrder.indexOf(section);
    const nextIndex = currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= document.sectionOrder.length) return;
    const nextOrder = [...document.sectionOrder];
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [
      nextOrder[nextIndex],
      nextOrder[currentIndex],
    ];
    updateDocument("sectionOrder", nextOrder);
    setAnnouncement(
      `${sectionMeta[section].label} moved ${delta < 0 ? "up" : "down"}.`,
    );
  };

  const toggleVisibility = (section: SectionId) => {
    const visible = document.visibleSections.includes(section);
    if (visible && document.visibleSections.length <= 3) {
      setAnnouncement("Keep at least three storefront sections visible.");
      return;
    }
    updateDocument(
      "visibleSections",
      visible
        ? document.visibleSections.filter((item) => item !== section)
        : [...document.visibleSections, section],
    );
    setAnnouncement(
      `${sectionMeta[section].label} is now ${visible ? "hidden" : "visible"}.`,
    );
  };

  const handleDragStart = (
    event: DragEvent<HTMLElement>,
    section: SectionId,
  ) => {
    setDraggedSection(section);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", section);
    setAnnouncement(`Moving ${sectionMeta[section].label}.`);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, target: SectionId) => {
    event.preventDefault();
    const source =
      draggedSection ??
      (event.dataTransfer.getData("text/plain") as SectionId | "");
    if (source && storefrontSectionIds.includes(source as SectionId)) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const placement =
        event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before";
      reorderSection(source as SectionId, target, placement);
    }
    setDraggedSection(null);
    setDropTarget(null);
  };

  const renderPreviewContent = (section: SectionId) => {
    switch (section) {
      case "featured":
        return featuredCount ? (
          <div className={styles.featuredPreview}>
            <p>{document.announcement}</p>
            <h3>{document.tagline}</h3>
            <span>
              {featuredCount} featured release{featuredCount === 1 ? "" : "s"}
            </span>
          </div>
        ) : (
          <EmptyPreview
            icon="F"
            title={document.tagline}
            copy="Featured products will appear here."
          />
        );
      case "booth-info":
        return (
          <div className={styles.boothPreview}>
            <p>Booth guide</p>
            <strong>{document.creatorName}</strong>
            <span>{document.eventName || "Next convention"}</span>
            <small>
              {document.eventVenue} / {document.eventBoothLabel}
            </small>
          </div>
        );
      case "browse":
        return (
          <div className={styles.browsePreview}>
            <span>All</span>
            <div>Search items...</div>
            <div>Sort: Recommended</div>
          </div>
        );
      case "catalogue":
        return productCount ? (
          <div className={styles.cataloguePreview}>
            {Array.from({ length: Math.min(productCount, 3) }, (_, index) => (
              <span key={index}>
                <i aria-hidden="true" />
                <b>Product {index + 1}</b>
              </span>
            ))}
          </div>
        ) : (
          <EmptyPreview
            icon="P"
            title="No merch is live yet"
            copy="Products will appear here as soon as the booth adds them."
          />
        );
      case "cart":
        return (
          <EmptyPreview
            icon="C"
            title="Your cart is empty"
            copy="Customer details are collected before reservation."
          />
        );
    }
  };

  return (
    <div className={styles.designer} style={previewStyle}>
      <form action={saveAction} className={styles.builderPanel}>
        <input type="hidden" name="boothId" value={boothId} />
        <input type="hidden" name="removeQr" value={String(removeQr)} />
        {documentFieldNames.map((fieldName) => (
          <input
            key={fieldName}
            type="hidden"
            name={fieldName}
            value={String(document[fieldName])}
          />
        ))}
        <input
          type="hidden"
          name="sectionOrder"
          value={JSON.stringify(document.sectionOrder)}
        />
        {document.visibleSections.map((section) => (
          <input
            key={section}
            type="hidden"
            name={`visible-${section}`}
            value="true"
          />
        ))}
        {paymentFieldNames.map((fieldName) => (
          <input
            key={fieldName}
            type="hidden"
            name={
              fieldName === "instructions"
                ? "paymentInstructions"
                : fieldName === "disclaimer"
                  ? "paymentDisclaimer"
                  : fieldName
            }
            value={payment[fieldName]}
          />
        ))}

        <div className={styles.builderHeader}>
          <span className={styles.builderMark} aria-hidden="true">
            SF
          </span>
          <div>
            <strong>Storefront builder</strong>
            <small>Click any preview block to edit it.</small>
          </div>
          <span className={styles.status}>{boothStatus.toLowerCase()}</span>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Editor panels">
          {editorTabs.map((item) => (
            <button
              key={item}
              id={`storefront-${item}-tab`}
              type="button"
              role="tab"
              aria-controls={`storefront-${item}-panel`}
              aria-selected={tab === item}
              tabIndex={tab === item ? 0 : -1}
              className={tab === item ? styles.activeTab : undefined}
              onClick={() => setTab(item)}
              onKeyDown={(event) => handleTabKeyDown(event, item)}
            >
              <ControlIcon name={item} />
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>

        <div className={styles.panelBody}>
          {tab === "layout" ? (
            <section
              id="storefront-layout-panel"
              role="tabpanel"
              aria-labelledby="storefront-layout-tab"
              tabIndex={0}
            >
              <div className={styles.panelIntro}>
                <div>
                  <h2 id="layout-panel-title">Page sections</h2>
                  <p>Drag preview blocks or use these arrow controls.</p>
                </div>
                <span>{document.visibleSections.length}/5 live</span>
              </div>
              <div className={styles.sectionList}>
                {document.sectionOrder.map((section, index) => {
                  const meta = sectionMeta[section];
                  const visible = document.visibleSections.includes(section);
                  return (
                    <div
                      className={`${styles.sectionRow} ${
                        selectedSection === section ? styles.selectedRow : ""
                      }`}
                      key={section}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropTarget(section);
                      }}
                      onDrop={(event) => handleDrop(event, section)}
                      data-drop-target={dropTarget === section || undefined}
                    >
                      <button
                        type="button"
                        className={styles.dragHandle}
                        draggable
                        onDragStart={(event) => handleDragStart(event, section)}
                        onDragEnd={() => {
                          setDraggedSection(null);
                          setDropTarget(null);
                        }}
                        onClick={() => selectSection(section)}
                        aria-label={`Select ${meta.label}. Drag this handle to reorder.`}
                      >
                        <ControlIcon name="drag" />
                      </button>
                      <button
                        type="button"
                        className={styles.sectionCopy}
                        onClick={() => selectSection(section)}
                      >
                        <strong>
                          {index + 1}. {meta.label}
                        </strong>
                        <small>{meta.description}</small>
                      </button>
                      <span className={styles.laneBadge}>{meta.lane}</span>
                      <button
                        type="button"
                        className={styles.visibilityButton}
                        data-visible={visible || undefined}
                        onClick={() => toggleVisibility(section)}
                        aria-pressed={visible}
                        aria-label={`${visible ? "Hide" : "Show"} ${meta.label}`}
                      >
                        <ControlIcon name={visible ? "visible" : "hidden"} />
                      </button>
                      <div className={styles.moveButtons}>
                        <button
                          type="button"
                          onClick={() => moveSection(section, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${meta.label} up`}
                        >
                          <ControlIcon name="up" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(section, 1)}
                          disabled={index === document.sectionOrder.length - 1}
                          aria-label={`Move ${meta.label} down`}
                        >
                          <ControlIcon name="down" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className={styles.panelNote}>
                Wide and side blocks keep their responsive lanes on desktop and
                collapse into one ordered column on phones.
              </p>
            </section>
          ) : null}

          {tab === "content" ? (
            <section
              id="storefront-content-panel"
              role="tabpanel"
              aria-labelledby="storefront-content-tab"
              tabIndex={0}
            >
              <div className={styles.panelIntro}>
                <div>
                  <p className={styles.editorEyebrow}>Selected section</p>
                  <h2 id="content-panel-title">{selectedMeta.label}</h2>
                  <p>{selectedMeta.description}</p>
                </div>
                <span className={styles.selectedIcon} aria-hidden="true">
                  {selectedMeta.icon}
                </span>
              </div>

              {selectedSection === "featured" ? (
                <div className={styles.controlStack}>
                  <Field label="Announcement">
                    <input
                      value={document.announcement}
                      maxLength={180}
                      onChange={(event) =>
                        updateDocument("announcement", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Spotlight headline">
                    <input
                      value={document.tagline}
                      required
                      maxLength={140}
                      onChange={(event) =>
                        updateDocument("tagline", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Welcome copy">
                    <textarea
                      value={document.introduction}
                      required
                      onChange={(event) =>
                        updateDocument("introduction", event.target.value)
                      }
                    />
                  </Field>
                  <p className={styles.panelNote}>
                    Featured product cards are chosen in the Products workspace.
                  </p>
                </div>
              ) : null}

              {selectedSection === "booth-info" ? (
                <div className={styles.controlStack}>
                  <Field label="Public booth name">
                    <input
                      value={document.name}
                      required
                      maxLength={80}
                      onChange={(event) =>
                        updateDocument("name", event.target.value)
                      }
                    />
                  </Field>
                  <div className={styles.fieldGrid}>
                    <Field label="Creator name">
                      <input
                        value={document.creatorName}
                        required
                        onChange={(event) =>
                          updateDocument("creatorName", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Pronouns">
                      <input
                        value={document.creatorPronouns}
                        onChange={(event) =>
                          updateDocument("creatorPronouns", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Creator bio">
                    <textarea
                      value={document.creatorBio}
                      onChange={(event) =>
                        updateDocument("creatorBio", event.target.value)
                      }
                    />
                  </Field>
                  <div className={styles.fieldGrid}>
                    <Field label="Event name">
                      <input
                        value={document.eventName}
                        onChange={(event) =>
                          updateDocument("eventName", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Booth label">
                      <input
                        value={document.eventBoothLabel}
                        onChange={(event) =>
                          updateDocument("eventBoothLabel", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Venue">
                    <input
                      value={document.eventVenue}
                      onChange={(event) =>
                        updateDocument("eventVenue", event.target.value)
                      }
                    />
                  </Field>
                  <div className={styles.fieldGrid}>
                    <Field label="Display hours">
                      <input
                        value={document.eventHours}
                        onChange={(event) =>
                          updateDocument("eventHours", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Status label">
                      <input
                        value={document.eventStatusLabel}
                        onChange={(event) =>
                          updateDocument("eventStatusLabel", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Location">
                    <input
                      value={document.creatorLocation}
                      onChange={(event) =>
                        updateDocument("creatorLocation", event.target.value)
                      }
                    />
                  </Field>
                </div>
              ) : null}

              {selectedSection === "browse" ? (
                <div className={styles.informationCard}>
                  <span aria-hidden="true">B</span>
                  <div>
                    <strong>Visitor controls are ready</strong>
                    <p>
                      Search and recommended sorting follow the active public
                      product catalogue. Reorder or hide this block from Layout.
                    </p>
                  </div>
                </div>
              ) : null}

              {selectedSection === "catalogue" ? (
                <div className={styles.controlStack}>
                  <div className={styles.informationCard}>
                    <span aria-hidden="true">P</span>
                    <div>
                      <strong>{productCount} public catalogue items</strong>
                      <p>
                        Product content, stock, pricing, and featured status are
                        managed in the Products workspace.
                      </p>
                    </div>
                  </div>
                  <Field label="Fulfilment note">
                    <textarea
                      value={document.eventFulfillment}
                      onChange={(event) =>
                        updateDocument("eventFulfillment", event.target.value)
                      }
                    />
                  </Field>
                </div>
              ) : null}

              {selectedSection === "cart" ? (
                <div className={styles.controlStack}>
                  <div className={styles.informationCard}>
                    <span aria-hidden="true">C</span>
                    <div>
                      <strong>Shown after reservation</strong>
                      <p>
                        Customers see these manual bank-transfer instructions
                        only after submitting their contact details.
                      </p>
                    </div>
                  </div>
                  <div className={styles.fieldGrid}>
                    <Field label="Payment label">
                      <input
                        value={payment.paymentLabel}
                        required
                        maxLength={80}
                        onChange={(event) =>
                          updatePayment("paymentLabel", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Bank name">
                      <input
                        value={payment.bankName}
                        required
                        onChange={(event) =>
                          updatePayment("bankName", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Account name">
                      <input
                        value={payment.accountName}
                        required
                        onChange={(event) =>
                          updatePayment("accountName", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Account number">
                      <input
                        value={payment.accountNumber}
                        required
                        onChange={(event) =>
                          updatePayment("accountNumber", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label="Transfer message template"
                      hint="Supports {code}, {item}, and {amount}. {ORDER} remains available for existing booths."
                    >
                      <input
                        value={payment.transferReferenceTemplate}
                        onChange={(event) =>
                          updatePayment(
                            "transferReferenceTemplate",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                  </div>
                  <section
                    className={styles.qrUploader}
                    aria-labelledby="payment-qr-heading"
                  >
                    <div className={styles.qrCopy}>
                      <div>
                        <strong id="payment-qr-heading">
                          Payment QR image
                        </strong>
                        <small>
                          Upload a PNG, JPEG, or WebP image up to 5 MB. It is
                          stored securely in Oracle Object Storage when you
                          save.
                        </small>
                      </div>
                      <span>
                        {qrFile
                          ? "Ready to save"
                          : hasStoredQr
                            ? "Uploaded"
                            : "Optional"}
                      </span>
                    </div>

                    <div className={styles.qrPreview}>
                      {visibleQrUrl ? (
                        <img src={visibleQrUrl} alt="Payment QR preview" />
                      ) : hasStoredQr ? (
                        <div>
                          <span aria-hidden="true">OK</span>
                          <strong>QR image saved</strong>
                          <small>
                            Public preview needs the Oracle delivery URL.
                          </small>
                        </div>
                      ) : (
                        <div>
                          <span aria-hidden="true">QR</span>
                          <strong>No QR image yet</strong>
                          <small>
                            Customers can still use the account details.
                          </small>
                        </div>
                      )}
                    </div>

                    <input
                      key={qrInputVersion}
                      id="payment-qr-image"
                      className={styles.srOnly}
                      type="file"
                      name="qrImage"
                      accept={paymentQrAccept}
                      disabled={!qrUploadConfigured}
                      onChange={(event) =>
                        chooseQrImage(event.target.files?.[0])
                      }
                    />
                    <div className={styles.qrActions}>
                      <label
                        className={
                          qrUploadConfigured
                            ? styles.qrUploadButton
                            : styles.qrUploadDisabled
                        }
                        htmlFor="payment-qr-image"
                        aria-disabled={!qrUploadConfigured}
                      >
                        {qrFile || hasStoredQr
                          ? "Replace image"
                          : "Choose image"}
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
                    {!qrUploadConfigured ? (
                      <p className={styles.qrHelp}>
                        Uploads are unavailable until the site owner completes
                        Oracle Object Storage configuration.
                      </p>
                    ) : null}
                    {qrSelectionError ? (
                      <p className={styles.formError} role="alert">
                        {qrSelectionError}
                      </p>
                    ) : null}
                  </section>
                  <Field label="Customer payment instructions">
                    <textarea
                      value={payment.instructions}
                      required
                      onChange={(event) =>
                        updatePayment("instructions", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Manual-review disclaimer">
                    <textarea
                      value={payment.disclaimer}
                      required
                      onChange={(event) =>
                        updatePayment("disclaimer", event.target.value)
                      }
                    />
                  </Field>
                </div>
              ) : null}
            </section>
          ) : null}

          <div hidden={tab !== "content" || selectedSection !== "booth-info"}>
            <BoothIdentityControls
              boothId={boothId}
              initialLogoObjectKey={identity.logoObjectKey}
              initialLogoUrl={identity.logoUrl}
              initialSocialLinks={identity.socialLinks}
              uploadConfigured={qrUploadConfigured}
              onBusyChange={setLogoUploadBusy}
              onDirty={() => setDirty(true)}
            />
          </div>

          {tab === "style" ? (
            <section
              id="storefront-style-panel"
              role="tabpanel"
              aria-labelledby="storefront-style-tab"
              tabIndex={0}
            >
              <div className={styles.panelIntro}>
                <div>
                  <h2 id="style-panel-title">Look & feel</h2>
                  <p>Changes update the preview immediately.</p>
                </div>
                <span className={styles.selectedIcon} aria-hidden="true">
                  S
                </span>
              </div>
              <div className={styles.controlStack}>
                <Field label="Theme preset">
                  <select
                    value={document.themePreset}
                    onChange={(event) =>
                      updateDocument(
                        "themePreset",
                        event.target.value as StorefrontDocument["themePreset"],
                      )
                    }
                  >
                    <option value="lantern">Lantern paper</option>
                    <option value="meadow">Meadow mint</option>
                    <option value="midnight">Midnight blue</option>
                  </select>
                </Field>
                <div className={styles.fieldGrid}>
                  <Field label="Accent color">
                    <input
                      type="color"
                      value={document.accentColor}
                      onChange={(event) =>
                        updateDocument("accentColor", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Card corners">
                    <select
                      value={document.cornerRadius}
                      onChange={(event) =>
                        updateDocument(
                          "cornerRadius",
                          event.target
                            .value as StorefrontDocument["cornerRadius"],
                        )
                      }
                    >
                      <option value="soft">Soft</option>
                      <option value="round">Round</option>
                      <option value="pill">Pill</option>
                    </select>
                  </Field>
                </div>
                <Field label="Storefront language">
                  <select
                    value={document.locale}
                    onChange={(event) =>
                      updateDocument(
                        "locale",
                        event.target.value as StorefrontDocument["locale"],
                      )
                    }
                  >
                    <option value="en">English</option>
                    <option value="vi">Tiếng Việt</option>
                  </select>
                </Field>
              </div>
            </section>
          ) : null}
        </div>

        {saveState.error ? (
          <p className={styles.saveError} role="alert">
            {saveState.error}
          </p>
        ) : null}
        <div className={styles.saveBar}>
          <span>
            {dirty ? "Unsaved draft changes" : `Draft v${editVersion}`}
          </span>
          <SubmitButton
            className={styles.saveButton}
            disabled={logoUploadBusy}
            pendingLabel="Saving draft..."
          >
            Save draft
          </SubmitButton>
        </div>
      </form>

      <section className={styles.previewPanel} aria-label="Storefront preview">
        <div className={styles.previewToolbar}>
          <div>
            <strong>{selectedMeta.label}</strong>
            <small>Draft preview / click a block to edit</small>
          </div>
          <div className={styles.deviceSwitch} aria-label="Preview device">
            <button
              type="button"
              data-active={previewMode === "desktop" || undefined}
              aria-pressed={previewMode === "desktop"}
              onClick={() => setPreviewMode("desktop")}
            >
              Desktop
            </button>
            <button
              type="button"
              data-active={previewMode === "phone" || undefined}
              aria-pressed={previewMode === "phone"}
              onClick={() => setPreviewMode("phone")}
            >
              Phone
            </button>
          </div>
          <form action={publishStorefrontAction} className={styles.publishForm}>
            <input type="hidden" name="boothId" value={boothId} />
            <button
              type="submit"
              className={styles.publishButton}
              disabled={dirty}
              title={dirty ? "Save the draft before publishing" : undefined}
            >
              Publish saved
            </button>
          </form>
        </div>

        <div className={styles.canvas}>
          <div
            className={`${styles.previewWindow} ${
              previewMode === "phone" ? styles.phonePreview : ""
            }`}
            data-theme={document.themePreset}
          >
            <div className={styles.previewSiteHeader}>
              <span className={styles.previewLogo} aria-hidden="true">
                C
              </span>
              <span>
                <strong>{document.name}</strong>
                <small>{document.eventStatusLabel}</small>
              </span>
              <button type="button" onClick={() => selectSection("booth-info")}>
                Edit info
              </button>
            </div>
            <div className={styles.previewGrid}>
              {visibleOrder.map((section, visibleIndex) => {
                const meta = sectionMeta[section];
                const selected = selectedSection === section;
                return (
                  <article
                    key={section}
                    className={`${styles.previewBlock} ${
                      meta.lane === "wide"
                        ? styles.previewWide
                        : styles.previewSide
                    } ${selected ? styles.selectedBlock : ""} ${
                      draggedSection === section ? styles.draggingBlock : ""
                    }`}
                    style={
                      {
                        "--preview-row-span": meta.previewRows,
                      } as CSSProperties
                    }
                    data-drop-target={dropTarget === section || undefined}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget(section);
                    }}
                    onDragLeave={() =>
                      setDropTarget((current) =>
                        current === section ? null : current,
                      )
                    }
                    onDrop={(event) => handleDrop(event, section)}
                  >
                    <button
                      type="button"
                      className={styles.previewSelectButton}
                      aria-label={`Edit ${meta.label}`}
                      aria-pressed={selected}
                      onClick={() => selectSection(section)}
                    />
                    <span className={styles.blockBadge}>
                      <button
                        type="button"
                        className={styles.previewDragHandle}
                        draggable
                        aria-label={`Drag ${meta.label} to reorder`}
                        onDragStart={(event) => handleDragStart(event, section)}
                        onDragEnd={() => {
                          setDraggedSection(null);
                          setDropTarget(null);
                        }}
                        onClick={() => selectSection(section)}
                      >
                        <ControlIcon name="drag" />
                      </button>
                      {visibleIndex + 1}
                      <b>{meta.label}</b>
                    </span>
                    {renderPreviewContent(section)}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
        <p className={styles.srOnly} aria-live="polite">
          {announcement}
        </p>
      </section>
    </div>
  );
}
