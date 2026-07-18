import Link from "next/link";
import {
  PageHeading,
  adminStyles as styles,
} from "@/components/admin/admin-shell";
import { SubmitButton } from "@/components/admin/form-controls";
import { requireBoothMember } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  saveGachaAction,
  saveGachaBannerAction,
  saveGachaPoolAction,
} from "../actions";

export default async function GachaPage({
  params,
  searchParams,
}: {
  params: Promise<{ boothId: string }>;
  searchParams: Promise<{ banner?: string; saved?: string; new?: string }>;
}) {
  const { boothId } = await params;
  const filters = await searchParams;
  const { membership } = await requireBoothMember(boothId);
  const canEdit = membership.role === "OWNER" || membership.role === "ADMIN";
  const [config, banners, products] = await Promise.all([
    db.gachaConfig.findUnique({ where: { boothId } }),
    db.gachaBanner.findMany({
      where: { boothId },
      include: { pool: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.product.findMany({
      where: { boothId, status: { in: ["LIVE", "DRAFT"] } },
      include: { variants: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const selectedBanner = filters.new
    ? null
    : (banners.find((banner) => banner.id === filters.banner) ??
      banners[0] ??
      null);
  const selectedVariantIds = new Set(
    selectedBanner?.pool
      .map((entry) => entry.productVariantId)
      .filter(Boolean) ?? [],
  );

  return (
    <>
      <PageHeading
        eyebrow="Minigame studio"
        title="Gacha"
        description="Turn booth items into a free, non-monetized surprise minigame."
        actions={
          <>
            <span className={styles.pill}>
              {config?.enabled ? "Published" : "Not published"}
            </span>
            <Link
              className={styles.button}
              href={`/s/${(await db.booth.findUniqueOrThrow({ where: { id: boothId } })).slug}`}
            >
              Preview storefront
            </Link>
          </>
        }
      />

      <p className={styles.notice}>
        Gacha in Cyfurden is free play only. It cannot sell pulls, take payment,
        consume stored value, or affect manual bank-transfer orders.
      </p>
      {filters.saved ? (
        <p className={styles.notice}>Gacha draft saved.</p>
      ) : null}

      <form
        action={saveGachaAction}
        className={`${styles.panel} ${styles.stack}`}
      >
        <input type="hidden" name="boothId" value={boothId} />
        <div className={styles.panelHeader}>
          <div>
            <h2>Game setup</h2>
            <p>Availability, public copy, and transparent pity rules.</p>
          </div>
          <span
            className={styles.statusBadge}
            data-status={config?.enabled ? "ACTIVE" : "DRAFT"}
          >
            {config?.enabled ? "open" : "closed"}
          </span>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.softPanel}>
            <label className={styles.checkboxField}>
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={config?.enabled ?? false}
              />
              <span>
                Open free play
                <small>Visitors can use the minigame when enabled.</small>
              </span>
            </label>
            <label className={styles.checkboxField} style={{ marginTop: 12 }}>
              <input
                name="pityEnabled"
                type="checkbox"
                defaultChecked={config?.pityEnabled ?? true}
              />
              <span>
                Guaranteed reward rule
                <small>
                  Clearly display the maximum free draws before a guarantee.
                </small>
              </span>
            </label>
            <label className={styles.field} style={{ marginTop: 12 }}>
              Guaranteed at
              <input
                name="guaranteedAt"
                type="number"
                min="1"
                max="500"
                defaultValue={config?.guaranteedAt ?? 50}
              />
            </label>
          </div>
          <div className={styles.softPanel}>
            <label className={styles.field}>
              Minigame title
              <input
                name="title"
                defaultValue={config?.title ?? "Wish upon the shelf"}
                required
              />
            </label>
            <label className={styles.field} style={{ marginTop: 12 }}>
              Introduction
              <textarea
                name="introduction"
                defaultValue={
                  config?.introduction ?? "Meet a surprise from this booth."
                }
                required
              />
            </label>
            <label className={styles.field} style={{ marginTop: 12 }}>
              Game theme
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
        </div>
        {canEdit ? (
          <SubmitButton
            className={styles.buttonPrimary}
            pendingLabel="Saving game…"
          >
            Save game setup
          </SubmitButton>
        ) : null}
      </form>

      <section className={styles.panel} style={{ marginTop: 18 }}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Banners & pool</h2>
            <p>Create themed sets and choose which product variants appear.</p>
          </div>
          {canEdit ? (
            <Link
              className={styles.button}
              href={`/manage/${boothId}/gacha?new=1`}
            >
              + Add banner
            </Link>
          ) : null}
        </div>
        {banners.length ? (
          <div className={styles.filterRow}>
            {banners.map((banner) => (
              <Link
                className={styles.tab}
                href={`/manage/${boothId}/gacha?banner=${banner.id}`}
                key={banner.id}
              >
                {banner.title} · {banner.active ? "active" : "draft"}
              </Link>
            ))}
          </div>
        ) : null}

        {selectedBanner || filters.new ? (
          <div className={styles.splitLayout} style={{ marginTop: 18 }}>
            <form
              action={saveGachaBannerAction}
              className={`${styles.softPanel} ${styles.stack}`}
            >
              <input type="hidden" name="boothId" value={boothId} />
              <input
                type="hidden"
                name="bannerId"
                value={selectedBanner?.id ?? ""}
              />
              <h3>
                {selectedBanner
                  ? `Editing ${selectedBanner.title}`
                  : "New banner"}
              </h3>
              <label className={styles.field}>
                Banner title
                <input
                  name="bannerTitle"
                  defaultValue={selectedBanner?.title ?? "Merch event wish"}
                  required
                />
              </label>
              <label className={styles.field}>
                Public copy
                <textarea
                  name="bannerCopy"
                  defaultValue={
                    selectedBanner?.copy ?? "Featured finds from this shelf."
                  }
                  required
                />
              </label>
              <div className={styles.formGrid}>
                <label className={styles.field}>
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
                <label className={styles.field}>
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
                <label className={styles.field}>
                  Featured count
                  <input
                    name="featuredCount"
                    type="number"
                    min="1"
                    max="10"
                    defaultValue={selectedBanner?.featuredCount ?? 3}
                  />
                </label>
              </div>
              <label className={styles.checkboxField}>
                <input
                  name="bannerActive"
                  type="checkbox"
                  defaultChecked={selectedBanner?.active ?? false}
                />
                Banner active
              </label>
              {canEdit ? (
                <SubmitButton
                  className={styles.buttonPrimary}
                  pendingLabel="Saving banner…"
                >
                  Save banner
                </SubmitButton>
              ) : null}
            </form>

            <form
              action={saveGachaPoolAction}
              className={`${styles.editorPane} ${styles.stack}`}
            >
              <input type="hidden" name="boothId" value={boothId} />
              <input
                type="hidden"
                name="bannerId"
                value={selectedBanner?.id ?? ""}
              />
              <div className={styles.panelHeader}>
                <div>
                  <h3>Wish pool</h3>
                  <p>
                    Select variants from this booth. Rewards are virtual
                    previews only.
                  </p>
                </div>
                <span className={styles.pill}>
                  {selectedVariantIds.size} selected
                </span>
              </div>
              {selectedBanner ? (
                products.length ? (
                  products.flatMap((product) =>
                    product.variants.map((variant) => (
                      <label className={styles.checkboxField} key={variant.id}>
                        <input
                          type="checkbox"
                          name="variantId"
                          value={variant.id}
                          defaultChecked={selectedVariantIds.has(variant.id)}
                        />
                        <span>
                          {product.name} · {variant.label}
                          <small>{variant.status.toLocaleLowerCase()}</small>
                        </span>
                      </label>
                    )),
                  )
                ) : (
                  <div className={styles.emptyState}>
                    <div>
                      <span className={styles.emptyIcon} aria-hidden="true">
                        ⌕
                      </span>
                      <h3>No matching merch</h3>
                      <p>Add products before building a gacha pool.</p>
                    </div>
                  </div>
                )
              ) : (
                <p className={styles.helperText}>
                  Save the banner before choosing its pool.
                </p>
              )}
              {selectedBanner && canEdit ? (
                <SubmitButton
                  className={styles.button}
                  pendingLabel="Saving pool…"
                >
                  Save pool
                </SubmitButton>
              ) : null}
            </form>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div>
              <span className={styles.emptyIcon} aria-hidden="true">
                ✦
              </span>
              <h3>No banners yet</h3>
              <p>Create the first themed pool for this free minigame.</p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
