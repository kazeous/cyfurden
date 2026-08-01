import Link from "next/link";
import {
  PageHeading,
  adminStyles as admin,
} from "@/components/admin/admin-shell";
import { SubmitButton } from "@/components/admin/form-controls";
import { FreeGacha } from "@/components/storefront/free-gacha";
import { requireBoothSection } from "@/lib/authorization";
import { db } from "@/lib/db";
import { compileGachaDocument } from "@/lib/gacha-document";
import { DEFAULT_GACHA_RATES, readGachaRates } from "@/lib/gacha-rates";
import { eventDateInput } from "@/lib/order-events";
import { readStorefrontDocument } from "@/lib/storefront-document";
import {
  publishGachaAction,
  saveGachaAction,
  saveGachaBannerAction,
  saveGachaPoolAction,
  unpublishGachaAction,
} from "../actions";
import styles from "./gacha.module.css";

export default async function GachaPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{
    banner?: string;
    saved?: string;
    poolSaved?: string;
    new?: string;
    published?: string;
    unpublished?: string;
  }>;
}) {
  const { boothId } = await params;
  const filters = await searchParams;
  const { booth } = await requireBoothSection(boothId, "gacha");
  const [config, banners, products, storefront] = await Promise.all([
    db.gachaConfig.findUnique({ where: { boothId } }),
    db.gachaBanner.findMany({
      where: { boothId },
      include: {
        pool: {
          include: { productVariant: { include: { product: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.product.findMany({
      where: { boothId, status: { in: ["LIVE", "DRAFT"] } },
      include: { variants: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    }),
    db.storefrontConfig.findUnique({ where: { boothId } }),
  ]);
  const selectedBanner = filters.new
    ? null
    : (banners.find((banner) => banner.id === filters.banner) ?? null);
  const staleSelection = Boolean(
    filters.banner && !filters.new && !selectedBanner,
  );
  const selectedEntries = new Map(
    selectedBanner?.pool.flatMap((entry) =>
      entry.productVariantId ? [[entry.productVariantId, entry] as const] : [],
    ) ?? [],
  );
  const rates = readGachaRates(config?.rates ?? DEFAULT_GACHA_RATES).value;
  const compilation = compileGachaDocument({
    config,
    banners,
    publishedAt: config?.updatedAt ?? new Date(),
  });
  const storefrontDocument = readStorefrontDocument(
    storefront?.draftDocument,
    booth.name,
  );
  const isPublished = Boolean(config?.publishedAt && config.publishedDocument);

  return (
    <>
      <PageHeading
        eyebrow="Public booth feature"
        title="Free reveal game"
        description="Build a scheduled, transparent digital reveal game, preview the saved draft, then publish it to the booth."
        actions={
          <span
            className={admin.statusBadge}
            data-status={isPublished ? "ACTIVE" : "DRAFT"}
          >
            {isPublished ? "Published" : "Draft only"}
          </span>
        }
      />

      <div className={styles.scopeNotice} role="note">
        <strong>Free digital reveal only</strong>
        <span>
          A play never creates an order or claim, debits stock, stores value, or
          asks for payment. Publishing exposes only the saved snapshot.
        </span>
      </div>

      {filters.saved ? (
        <p className={admin.successNotice} role="status">
          Game configuration saved.
        </p>
      ) : null}
      {filters.poolSaved ? (
        <p className={admin.successNotice} role="status">
          Reward pool saved.
        </p>
      ) : null}
      {filters.published ? (
        <p className={admin.successNotice} role="status">
          Game published. Visitors now see this saved revision.
        </p>
      ) : null}
      {filters.unpublished ? (
        <p className={admin.successNotice} role="status">
          Game unpublished. Its saved draft is still available here.
        </p>
      ) : null}

      <section className={admin.panel} aria-labelledby="game-setup-title">
        <div className={admin.panelHeader}>
          <div>
            <h2 id="game-setup-title">Game setup</h2>
            <p>Control the draft copy and guarantee rule.</p>
          </div>
        </div>
        <form action={saveGachaAction} className={styles.setupForm}>
          <input type="hidden" name="boothId" value={boothId} />
          <div className={styles.formSection}>
            <h3>Availability</h3>
            <label className={admin.checkboxField}>
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={config?.enabled ?? false}
              />
              <span>
                Include the game in the next publish
                <small>
                  Saving remains a draft until you use the publish footer.
                </small>
              </span>
            </label>
            <label className={admin.checkboxField}>
              <input
                name="pityEnabled"
                type="checkbox"
                defaultChecked={config?.pityEnabled ?? true}
              />
              <span>
                Use a guaranteed reward rule
                <small>Sets a transparent maximum number of free draws.</small>
              </span>
            </label>
            <label className={admin.field}>
              Guaranteed by draw
              <input
                name="guaranteedAt"
                type="number"
                min="1"
                max="500"
                defaultValue={config?.guaranteedAt ?? 50}
              />
            </label>
            <label className={admin.field}>
              Guaranteed rarity
              <select
                name="guaranteedRarity"
                defaultValue={config?.guaranteedRarity ?? "EPIC"}
              >
                <option value="RARE">Rare or better</option>
                <option value="EPIC">Epic or better</option>
                <option value="LEGENDARY">Legendary</option>
              </select>
            </label>
          </div>

          <div className={styles.formSection}>
            <h3>Presentation</h3>
            <label className={admin.field}>
              Game title
              <input
                name="title"
                defaultValue={config?.title ?? "Wish upon the shelf"}
                maxLength={80}
                required
              />
            </label>
            <label className={admin.field}>
              Introduction
              <textarea
                name="introduction"
                defaultValue={
                  config?.introduction ?? "Meet a surprise from this booth."
                }
                maxLength={240}
                required
              />
            </label>
            <label className={admin.field}>
              Visual theme
              <select
                name="gameTheme"
                defaultValue={config?.gameTheme ?? "anemo"}
              >
                <option value="anemo">Breeze</option>
                <option value="ember">Ember</option>
                <option value="starlight">Starlight</option>
              </select>
            </label>
          </div>

          <div className={styles.formSection}>
            <h3>Tier odds</h3>
            <p className={styles.sectionHelp}>
              Whole percentages across all four tiers must total 100. Item
              weights inside a tier are edited in each banner lineup.
            </p>
            <div className={styles.oddsGrid}>
              <label className={admin.field}>
                Common %
                <input
                  name="rateCommon"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={rates.common}
                  required
                />
              </label>
              <label className={admin.field}>
                Rare %
                <input
                  name="rateRare"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={rates.rare}
                  required
                />
              </label>
              <label className={admin.field}>
                Epic %
                <input
                  name="rateEpic"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={rates.epic}
                  required
                />
              </label>
              <label className={admin.field}>
                Legendary %
                <input
                  name="rateLegendary"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={rates.legendary}
                  required
                />
              </label>
            </div>
            <strong className={styles.oddsTotal}>
              Total: {rates.common + rates.rare + rates.epic + rates.legendary}%
            </strong>
          </div>

          <div className={styles.formActions}>
            <SubmitButton
              className={admin.buttonPrimary}
              pendingLabel="Saving setup…"
            >
              Save setup
            </SubmitButton>
          </div>
        </form>
      </section>

      <section
        className={`${admin.panel} ${styles.bannerPanel}`}
        aria-labelledby="banners-title"
      >
        <div className={admin.panelHeader}>
          <div>
            <h2 id="banners-title">Reward banners</h2>
            <p>Group product variants into a clear free-play reward pool.</p>
          </div>
          <Link
            className={admin.buttonPrimary}
            href={`/manage/${boothId}/gacha?new=1`}
          >
            Add banner
          </Link>
        </div>

        {staleSelection ? (
          <p className={admin.errorNotice} role="alert">
            That banner no longer exists. Choose another banner below.
          </p>
        ) : null}

        <div className={styles.bannerWorkspace}>
          <aside className={styles.bannerIndex} aria-label="Reward banners">
            {banners.length ? (
              <ul>
                {banners.map((banner) => {
                  const selected = banner.id === selectedBanner?.id;
                  return (
                    <li key={banner.id}>
                      <Link
                        aria-current={selected ? "page" : undefined}
                        className={styles.bannerLink}
                        data-active={selected || undefined}
                        href={`/manage/${boothId}/gacha?banner=${banner.id}`}
                      >
                        <span>
                          <strong>{banner.title}</strong>
                          <small>{banner.pool.length} rewards</small>
                        </span>
                        <span
                          className={admin.statusBadge}
                          data-status={banner.active ? "ACTIVE" : "DRAFT"}
                        >
                          {banner.active ? "active" : "draft"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.compactEmpty}>
                <h3>No banners yet</h3>
                <p>
                  Create one, then choose which variants belong in its pool.
                </p>
              </div>
            )}
          </aside>

          <div className={styles.bannerEditor}>
            {selectedBanner || filters.new ? (
              <>
                <form
                  action={saveGachaBannerAction}
                  className={styles.cardForm}
                >
                  <input type="hidden" name="boothId" value={boothId} />
                  <input
                    type="hidden"
                    name="bannerId"
                    value={selectedBanner?.id ?? ""}
                  />
                  <div className={styles.editorHeading}>
                    <div>
                      <p>{selectedBanner ? "Edit banner" : "New banner"}</p>
                      <h3>{selectedBanner?.title ?? "Banner details"}</h3>
                    </div>
                    {filters.new ? (
                      <Link
                        className={admin.button}
                        href={`/manage/${boothId}/gacha`}
                      >
                        Cancel
                      </Link>
                    ) : null}
                  </div>
                  <label className={admin.field}>
                    Banner title
                    <input
                      name="bannerTitle"
                      defaultValue={selectedBanner?.title ?? ""}
                      maxLength={80}
                      required
                    />
                  </label>
                  <label className={admin.field}>
                    Description
                    <textarea
                      name="bannerCopy"
                      defaultValue={selectedBanner?.copy ?? ""}
                      maxLength={240}
                      required
                    />
                  </label>
                  <div className={admin.formGridThree}>
                    <label className={admin.field}>
                      Banner type
                      <select
                        name="bannerType"
                        defaultValue={selectedBanner?.type ?? "COLLECTION"}
                      >
                        <option value="CHARACTER">Character</option>
                        <option value="WEAPON">Object</option>
                        <option value="COLLECTION">Collection</option>
                      </select>
                    </label>
                    <label className={admin.field}>
                      Theme
                      <select
                        name="bannerTheme"
                        defaultValue={selectedBanner?.theme ?? "anemo"}
                      >
                        <option value="anemo">Breeze</option>
                        <option value="ember">Ember</option>
                        <option value="starlight">Starlight</option>
                      </select>
                    </label>
                    <label className={admin.field}>
                      Featured rewards
                      <input
                        name="featuredCount"
                        type="number"
                        min="1"
                        max="10"
                        defaultValue={selectedBanner?.featuredCount ?? 3}
                      />
                    </label>
                  </div>
                  <div className={styles.dateGrid}>
                    <label className={admin.field}>
                      Starts on (optional)
                      <input
                        name="startDate"
                        type="date"
                        defaultValue={
                          selectedBanner?.startsAt
                            ? eventDateInput(selectedBanner.startsAt)
                            : ""
                        }
                      />
                    </label>
                    <label className={admin.field}>
                      Ends on (optional)
                      <input
                        name="endDate"
                        type="date"
                        defaultValue={
                          selectedBanner?.endsAt
                            ? eventDateInput(selectedBanner.endsAt, true)
                            : ""
                        }
                      />
                    </label>
                  </div>
                  <label className={admin.checkboxField}>
                    <input
                      name="bannerActive"
                      type="checkbox"
                      defaultChecked={selectedBanner?.active ?? false}
                    />
                    <span>
                      Include this banner when publishing
                      <small>
                        Leave both dates empty to keep it open whenever the game
                        is published.
                      </small>
                    </span>
                  </label>
                  <SubmitButton
                    className={admin.buttonPrimary}
                    pendingLabel="Saving banner…"
                  >
                    Save banner
                  </SubmitButton>
                </form>

                {selectedBanner ? (
                  <form
                    action={saveGachaPoolAction}
                    className={styles.cardForm}
                  >
                    <input type="hidden" name="boothId" value={boothId} />
                    <input
                      type="hidden"
                      name="bannerId"
                      value={selectedBanner.id}
                    />
                    <div className={styles.editorHeading}>
                      <div>
                        <p>Reward pool</p>
                        <h3>Choose product variants</h3>
                      </div>
                      <span className={admin.pill}>
                        {selectedEntries.size} selected
                      </span>
                    </div>
                    <p className={styles.sectionHelp}>
                      Tier odds choose a rarity first; weight chooses among
                      reveals inside that rarity. Higher weight means more
                      frequent.
                    </p>
                    {products.some((product) => product.variants.length) ? (
                      <div className={styles.variantList}>
                        {products.flatMap((product) =>
                          product.variants.map((variant) => {
                            const entry = selectedEntries.get(variant.id);
                            return (
                              <div
                                className={styles.variantRow}
                                key={variant.id}
                              >
                                <label className={styles.variantChoice}>
                                  <input
                                    type="checkbox"
                                    name="variantId"
                                    value={variant.id}
                                    defaultChecked={Boolean(entry)}
                                  />
                                  <span>
                                    <strong>
                                      {product.name} · {variant.label}
                                    </strong>
                                    <small>
                                      {variant.status.toLocaleLowerCase()}
                                    </small>
                                  </span>
                                </label>
                                <div className={styles.variantControls}>
                                  <label>
                                    Rarity
                                    <select
                                      name={`rarity:${variant.id}`}
                                      defaultValue={entry?.rarity ?? "COMMON"}
                                    >
                                      <option value="COMMON">Common</option>
                                      <option value="RARE">Rare</option>
                                      <option value="EPIC">Epic</option>
                                      <option value="LEGENDARY">
                                        Legendary
                                      </option>
                                    </select>
                                  </label>
                                  <label>
                                    Weight
                                    <input
                                      name={`weight:${variant.id}`}
                                      type="number"
                                      min="1"
                                      max="1000"
                                      defaultValue={entry?.weight ?? 1}
                                    />
                                  </label>
                                  <label className={styles.featuredToggle}>
                                    <input
                                      name={`featured:${variant.id}`}
                                      type="checkbox"
                                      defaultChecked={entry?.featured ?? false}
                                    />
                                    Featured
                                  </label>
                                </div>
                              </div>
                            );
                          }),
                        )}
                      </div>
                    ) : (
                      <div className={styles.compactEmpty}>
                        <h3>No eligible variants</h3>
                        <p>
                          Add a draft or live product before building a pool.
                        </p>
                        <Link
                          className={admin.button}
                          href={`/manage/${boothId}/products?new=1`}
                        >
                          Add product
                        </Link>
                      </div>
                    )}
                    <SubmitButton
                      className={admin.button}
                      pendingLabel="Saving pool…"
                    >
                      Save reward pool
                    </SubmitButton>
                  </form>
                ) : (
                  <p className={styles.helperText}>
                    Save the banner before choosing its reward pool.
                  </p>
                )}
              </>
            ) : (
              <div className={styles.editorEmpty}>
                <h3>Select a banner to edit</h3>
                <p>
                  Banner details and reward choices stay together in this panel.
                </p>
                <Link
                  className={admin.buttonPrimary}
                  href={`/manage/${boothId}/gacha?new=1`}
                >
                  Create banner
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        className={`${admin.panel} ${styles.previewPanel}`}
        aria-labelledby="gacha-preview-title"
      >
        <div className={admin.panelHeader}>
          <div>
            <h2 id="gacha-preview-title">Saved draft preview</h2>
            <p>
              This uses the same game component as the public booth. Save each
              form before checking the preview.
            </p>
          </div>
          <span
            className={admin.statusBadge}
            data-status={compilation.success ? "ACTIVE" : "DRAFT"}
          >
            {compilation.success ? "Ready to publish" : "Needs attention"}
          </span>
        </div>

        {compilation.success ? (
          <div className={styles.previewCanvas}>
            <FreeGacha
              document={compilation.document}
              boothSlug={booth.slug}
              locale={storefrontDocument.locale}
              preview
            />
          </div>
        ) : (
          <div className={styles.readiness} role="note">
            <h3>Finish the saved draft</h3>
            <ul>
              {compilation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className={styles.publishBar} aria-label="Game publishing">
        <div>
          <strong>
            {isPublished ? "Game is published" : "Draft is private"}
          </strong>
          <span>
            {isPublished && config?.publishedAt
              ? `Published ${config.publishedAt.toLocaleString("en-GB", {
                  timeZone: "Asia/Ho_Chi_Minh",
                })}`
              : "Publishing creates a public snapshot; later edits stay private."}
          </span>
        </div>
        <div className={styles.publishActions}>
          {isPublished ? (
            <form action={unpublishGachaAction}>
              <input type="hidden" name="boothId" value={boothId} />
              <SubmitButton
                className={admin.button}
                pendingLabel="Unpublishing…"
              >
                Unpublish
              </SubmitButton>
            </form>
          ) : null}
          <form action={publishGachaAction}>
            <input type="hidden" name="boothId" value={boothId} />
            <SubmitButton
              className={admin.buttonPrimary}
              pendingLabel="Publishing…"
              disabled={!compilation.success}
            >
              {isPublished ? "Publish saved changes" : "Publish game"}
            </SubmitButton>
          </form>
        </div>
      </aside>
    </>
  );
}
