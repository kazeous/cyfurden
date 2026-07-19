"use client";

import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  useMemo,
  useState,
} from "react";
import {
  publishStorefrontAction,
  saveStorefrontAction,
} from "@/app/manage/[boothId]/actions";
import {
  type StorefrontDocument,
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
  transferReferenceTemplate: string;
  qrObjectKey: string;
  instructions: string;
  disclaimer: string;
};

const sectionMeta: Record<
  SectionId,
  { label: string; description: string; lane: "wide" | "side"; icon: string }
> = {
  featured: {
    label: "Featured spotlight",
    description: "Announcement, headline, and welcome copy",
    lane: "wide",
    icon: "✦",
  },
  "booth-info": {
    label: "Booth information",
    description: "Creator, convention, location, and hours",
    lane: "side",
    icon: "⌂",
  },
  browse: {
    label: "Browse controls",
    description: "Search, filter, and collection controls",
    lane: "wide",
    icon: "⌕",
  },
  catalogue: {
    label: "Product collection",
    description: "The public product catalogue",
    lane: "wide",
    icon: "◇",
  },
  cart: {
    label: "Shopping cart",
    description: "Cart and manual bank-transfer handoff",
    lane: "side",
    icon: "▣",
  },
};

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
  "transferReferenceTemplate",
  "qrObjectKey",
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
  editVersion,
  productCount,
  featuredCount,
}: {
  boothId: string;
  boothStatus: string;
  document: StorefrontDocument;
  payment: StorefrontPaymentDraft;
  editVersion: number;
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
  const [announcement, setAnnouncement] = useState(
    "Select a block in the preview to edit it.",
  );

  const selectedMeta = sectionMeta[selectedSection];
  const visibleOrder = useMemo(
    () =>
      document.sectionOrder.filter((section) =>
        document.visibleSections.includes(section),
      ),
    [document.sectionOrder, document.visibleSections],
  );
  const previewStyle = {
    "--designer-accent": document.accentColor,
    "--designer-radius":
      document.cornerRadius === "soft"
        ? "10px"
        : document.cornerRadius === "pill"
          ? "24px"
          : "16px",
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

  const selectSection = (section: SectionId) => {
    setSelectedSection(section);
    setTab("content");
    setAnnouncement(`${sectionMeta[section].label} selected for editing.`);
  };

  const reorderSection = (source: SectionId, target: SectionId) => {
    if (source === target) return;
    const nextOrder = document.sectionOrder.filter((item) => item !== source);
    const targetIndex = nextOrder.indexOf(target);
    nextOrder.splice(targetIndex, 0, source);
    updateDocument("sectionOrder", nextOrder);
    setAnnouncement(
      `${sectionMeta[source].label} moved before ${sectionMeta[target].label}.`,
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
      reorderSection(source as SectionId, target);
    }
    setDraggedSection(null);
    setDropTarget(null);
  };

  const handlePointerDown = (section: SectionId) => {
    setDraggedSection(section);
    setDropTarget(section);
  };

  const handlePointerEnter = (section: SectionId) => {
    if (draggedSection && draggedSection !== section) {
      setDropTarget(section);
    }
  };

  const handlePointerUp = (section: SectionId) => {
    if (!draggedSection) return;
    const source = draggedSection;
    if (source !== section) {
      const nextOrder = document.sectionOrder.filter((item) => item !== source);
      const targetIndex = nextOrder.indexOf(section);
      nextOrder.splice(targetIndex, 0, source);
      updateDocument("sectionOrder", nextOrder);
      setAnnouncement(
        `${sectionMeta[source].label} moved before ${sectionMeta[section].label}.`,
      );
    }
    setDraggedSection(null);
    setDropTarget(null);
  };

  const handlePreviewKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    section: SectionId,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectSection(section);
    }
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
            icon="✦"
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
              {document.eventVenue} · {document.eventBoothLabel}
            </small>
          </div>
        );
      case "browse":
        return (
          <div className={styles.browsePreview}>
            <span>All</span>
            <div>⌕ Search items…</div>
            <div>↕ Recommended</div>
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
            icon="◇"
            title="No merch is live yet"
            copy="Products will appear here as soon as the booth adds them."
          />
        );
      case "cart":
        return (
          <EmptyPreview
            icon="▣"
            title="Your cart is empty"
            copy={`${payment.bankName || "Bank transfer"} · manual review`}
          />
        );
    }
  };

  return (
    <div className={styles.designer} style={previewStyle}>
      <form action={saveStorefrontAction} className={styles.builderPanel}>
        <input type="hidden" name="boothId" value={boothId} />
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
            ▤
          </span>
          <div>
            <strong>Storefront builder</strong>
            <small>Click any preview block to edit it.</small>
          </div>
          <span className={styles.status}>{boothStatus.toLowerCase()}</span>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Editor panels">
          {(["layout", "content", "style"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={tab === item ? styles.activeTab : undefined}
              onClick={() => setTab(item)}
            >
              <span aria-hidden="true">
                {item === "layout" ? "▦" : item === "content" ? "T" : "◉"}
              </span>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>

        <div className={styles.panelBody}>
          {tab === "layout" ? (
            <section aria-labelledby="layout-panel-title">
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
                      draggable
                      onDragStart={(event) => handleDragStart(event, section)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropTarget(section);
                      }}
                      onDrop={(event) => handleDrop(event, section)}
                      onDragEnd={() => {
                        setDraggedSection(null);
                        setDropTarget(null);
                      }}
                      onPointerDown={() => handlePointerDown(section)}
                      onPointerEnter={() => handlePointerEnter(section)}
                      onPointerUp={() => handlePointerUp(section)}
                      data-drop-target={dropTarget === section || undefined}
                    >
                      <button
                        type="button"
                        className={styles.dragHandle}
                        onClick={() => selectSection(section)}
                        aria-label={`Select ${meta.label}; drag to reorder`}
                      >
                        ⠿
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
                        {visible ? "●" : "○"}
                      </button>
                      <div className={styles.moveButtons}>
                        <button
                          type="button"
                          onClick={() => moveSection(section, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${meta.label} up`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(section, 1)}
                          disabled={index === document.sectionOrder.length - 1}
                          aria-label={`Move ${meta.label} down`}
                        >
                          ↓
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
            <section aria-labelledby="content-panel-title">
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
                  <span aria-hidden="true">⌕</span>
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
                    <span aria-hidden="true">◇</span>
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
                    <span aria-hidden="true">▣</span>
                    <div>
                      <strong>Manual bank transfer only</strong>
                      <p>
                        These instructions never claim that Cyfurden verified a
                        payment.
                      </p>
                    </div>
                  </div>
                  <div className={styles.fieldGrid}>
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
                    <Field label="Reference template">
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
                  <Field
                    label="Oracle QR object key"
                    hint="The image remains in Oracle Object Storage."
                  >
                    <input
                      value={payment.qrObjectKey}
                      onChange={(event) =>
                        updatePayment("qrObjectKey", event.target.value)
                      }
                    />
                  </Field>
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

          {tab === "style" ? (
            <section aria-labelledby="style-panel-title">
              <div className={styles.panelIntro}>
                <div>
                  <h2 id="style-panel-title">Look & feel</h2>
                  <p>Changes update the preview immediately.</p>
                </div>
                <span className={styles.selectedIcon} aria-hidden="true">
                  ◉
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

        <div className={styles.saveBar}>
          <span>
            {dirty ? "Unsaved draft changes" : `Draft v${editVersion}`}
          </span>
          <SubmitButton
            className={styles.saveButton}
            pendingLabel="Saving draft…"
          >
            Save draft
          </SubmitButton>
        </div>
      </form>

      <section className={styles.previewPanel} aria-label="Storefront preview">
        <div className={styles.previewToolbar}>
          <div>
            <strong>{selectedMeta.label}</strong>
            <small>Draft preview · click a block to edit</small>
          </div>
          <div className={styles.deviceSwitch} aria-label="Preview device">
            <button
              type="button"
              data-active={previewMode === "desktop" || undefined}
              onClick={() => setPreviewMode("desktop")}
            >
              ▣ Desktop
            </button>
            <button
              type="button"
              data-active={previewMode === "phone" || undefined}
              onClick={() => setPreviewMode("phone")}
            >
              ▯ Phone
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
                ⓘ Booth info
              </button>
            </div>
            <div className={styles.previewGrid}>
              {visibleOrder.map((section) => {
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
                    role="button"
                    tabIndex={0}
                    draggable
                    aria-label={`${meta.label}. Click to edit or drag to reorder.`}
                    aria-pressed={selected}
                    data-drop-target={dropTarget === section || undefined}
                    onClick={() => selectSection(section)}
                    onKeyDown={(event) => handlePreviewKeyDown(event, section)}
                    onDragStart={(event) => handleDragStart(event, section)}
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
                    onDragEnd={() => {
                      setDraggedSection(null);
                      setDropTarget(null);
                    }}
                    onPointerDown={() => handlePointerDown(section)}
                    onPointerEnter={() => handlePointerEnter(section)}
                    onPointerUp={() => handlePointerUp(section)}
                  >
                    <span className={styles.blockBadge}>
                      <i aria-hidden="true">⠿</i>
                      {document.sectionOrder.indexOf(section) + 1}
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
