import Link from "next/link";
import {
  PageHeading,
  adminStyles as admin,
} from "@/components/admin/admin-shell";
import { SubmitButton } from "@/components/admin/form-controls";
import { requireBoothRole } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  saveGachaAction,
  saveGachaBannerAction,
  saveGachaPoolAction,
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
  }>;
}) {
  const { boothId } = await params;
  const filters = await searchParams;
  await requireBoothRole(boothId, ["OWNER", "ADMIN"]);
  const [config, banners, products] = await Promise.all([
    db.gachaConfig.findUnique({ where: { boothId } }),
    db.gachaBanner.findMany({
      where: { boothId },
      include: { pool: true },
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
    }),
    db.product.findMany({
      where: { boothId, status: { in: ["LIVE", "DRAFT"] } },
      include: { variants: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const selectedBanner = filters.new
    ? null
    : (banners.find((banner) => banner.id === filters.banner) ?? null);
  const staleSelection = Boolean(
    filters.banner && !filters.new && !selectedBanner,
  );
  const selectedVariantIds = new Set(
    selectedBanner?.pool
      .map((entry) => entry.productVariantId)
      .filter(Boolean) ?? [],
  );

  return (
    <>
      <PageHeading
        eyebrow="Optional booth feature"
        title="Free game"
        description="Prepare a free surprise pool without payments, credits, or paid pulls."
        actions={
          <span
            className={admin.statusBadge}
            data-status={config?.enabled ? "ACTIVE" : "DRAFT"}
          >
            {config?.enabled ? "Configuration enabled" : "Configuration off"}
          </span>
        }
      />

      <div className={styles.scopeNotice} role="note">
        <strong>Configuration only</strong>
        <span>
          The visitor-facing game is not connected to the public storefront yet.
          Saving here prepares content without claiming it is live.
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
                Enable this configuration
                <small>
                  This does not publish a visitor-facing game in the current
                  release.
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
                  <label className={admin.checkboxField}>
                    <input
                      name="bannerActive"
                      type="checkbox"
                      defaultChecked={selectedBanner?.active ?? false}
                    />
                    <span>
                      Mark configuration active
                      <small>Used when the public game is implemented.</small>
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
                        {selectedVariantIds.size} selected
                      </span>
                    </div>
                    {products.some((product) => product.variants.length) ? (
                      <div className={styles.variantList}>
                        {products.flatMap((product) =>
                          product.variants.map((variant) => (
                            <label
                              className={admin.checkboxField}
                              key={variant.id}
                            >
                              <input
                                type="checkbox"
                                name="variantId"
                                value={variant.id}
                                defaultChecked={selectedVariantIds.has(
                                  variant.id,
                                )}
                              />
                              <span>
                                {product.name} · {variant.label}
                                <small>
                                  {variant.status.toLocaleLowerCase()}
                                </small>
                              </span>
                            </label>
                          )),
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
    </>
  );
}
