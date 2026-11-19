import type { Metadata } from "next";
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
import { parseBilingual } from "@/lib/i18n";
import { localizeGachaCompilationError } from "@/lib/i18n/gacha-errors";
import { formatDateTime } from "@/lib/i18n/intl";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { eventDateInput } from "@/lib/order-events";
import { readStorefrontDocument } from "@/lib/storefront-document";
import { defaultGachaContent } from "@/lib/system-content";
import {
  publishGachaAction,
  saveGachaAction,
  saveGachaBannerAction,
  saveGachaPoolAction,
  unpublishGachaAction,
} from "../actions";
import styles from "./gacha.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const strings = getWorkspaceStrings(await readLocaleCookie()).gacha;
  return {
    title: strings.metadataTitle,
    robots: { index: false, follow: false },
  };
}

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
  const [config, banners, products, storefront, locale] = await Promise.all([
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
    readLocaleCookie(),
  ]);
  const workspaceStrings = getWorkspaceStrings(locale);
  const strings = workspaceStrings.gacha;
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
        eyebrow={strings.eyebrow}
        title={strings.title}
        description={strings.description}
        actions={
          <span
            className={admin.statusBadge}
            data-status={isPublished ? "ACTIVE" : "DRAFT"}
          >
            {isPublished ? strings.published : strings.draftOnly}
          </span>
        }
      />

      <div className={styles.scopeNotice} role="note">
        <strong>{strings.scopeTitle}</strong>
        <span>{strings.scopeBody}</span>
      </div>

      {filters.saved ? (
        <p className={admin.successNotice} role="status">
          {strings.configSaved}
        </p>
      ) : null}
      {filters.poolSaved ? (
        <p className={admin.successNotice} role="status">
          {strings.poolSaved}
        </p>
      ) : null}
      {filters.published ? (
        <p className={admin.successNotice} role="status">
          {strings.publishedNotice}
        </p>
      ) : null}
      {filters.unpublished ? (
        <p className={admin.successNotice} role="status">
          {strings.unpublishedNotice}
        </p>
      ) : null}

      <section className={admin.panel} aria-labelledby="game-setup-title">
        <div className={admin.panelHeader}>
          <div>
            <h2 id="game-setup-title">{strings.setupTitle}</h2>
            <p>{strings.setupBody}</p>
          </div>
        </div>
        <form action={saveGachaAction} className={styles.setupForm}>
          <input type="hidden" name="boothId" value={boothId} />
          <div className={styles.formSection}>
            <h3>{strings.availability}</h3>
            <label className={admin.checkboxField}>
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={config?.enabled ?? false}
              />
              <span>
                {strings.includeGame}
                <small>{strings.includeGameHelp}</small>
              </span>
            </label>
            <label className={admin.checkboxField}>
              <input
                name="pityEnabled"
                type="checkbox"
                defaultChecked={config?.pityEnabled ?? true}
              />
              <span>
                {strings.useGuarantee}
                <small>{strings.useGuaranteeHelp}</small>
              </span>
            </label>
            <label className={admin.field}>
              {strings.guaranteedBy}
              <input
                name="guaranteedAt"
                type="number"
                min="1"
                max="500"
                defaultValue={config?.guaranteedAt ?? 50}
              />
            </label>
            <label className={admin.field}>
              {strings.guaranteedRarity}
              <select
                name="guaranteedRarity"
                defaultValue={config?.guaranteedRarity ?? "EPIC"}
              >
                <option value="RARE">{strings.rareOrBetter}</option>
                <option value="EPIC">{strings.epicOrBetter}</option>
                <option value="LEGENDARY">{strings.legendary}</option>
              </select>
            </label>
          </div>

          <div className={styles.formSection}>
            <h3>{strings.presentation}</h3>
            <label className={admin.field}>
              {strings.gameTitle}
              <input
                name="title"
                defaultValue={config?.title ?? defaultGachaContent.title}
                maxLength={80}
                required
              />
            </label>
            <label className={admin.field}>
              {strings.introduction}
              <textarea
                name="introduction"
                defaultValue={
                  config?.introduction ?? defaultGachaContent.introduction
                }
                maxLength={240}
                required
              />
            </label>
            <label className={admin.field}>
              {strings.visualTheme}
              <select
                name="gameTheme"
                defaultValue={config?.gameTheme ?? "anemo"}
              >
                <option value="anemo">{strings.breeze}</option>
                <option value="ember">{strings.ember}</option>
                <option value="starlight">{strings.starlight}</option>
              </select>
            </label>
          </div>

          <div className={styles.formSection}>
            <h3>{strings.tierOdds}</h3>
            <p className={styles.sectionHelp}>{strings.oddsHelp}</p>
            <div className={styles.oddsGrid}>
              <label className={admin.field}>
                {strings.commonPercent}
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
                {strings.rarePercent}
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
                {strings.epicPercent}
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
                {strings.legendaryPercent}
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
              {strings.totalPercent(
                rates.common + rates.rare + rates.epic + rates.legendary,
              )}
            </strong>
          </div>

          <div className={styles.formActions}>
            <SubmitButton
              className={admin.buttonPrimary}
              pendingLabel={strings.savingSetup}
            >
              {strings.saveSetup}
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
            <h2 id="banners-title">{strings.bannersTitle}</h2>
            <p>{strings.bannersBody}</p>
          </div>
          <Link
            className={admin.buttonPrimary}
            href={`/manage/${boothId}/gacha?new=1`}
          >
            {strings.addBanner}
          </Link>
        </div>

        {staleSelection ? (
          <p className={admin.errorNotice} role="alert">
            {strings.staleBanner}
          </p>
        ) : null}

        <div className={styles.bannerWorkspace}>
          <aside
            className={styles.bannerIndex}
            aria-label={strings.bannersAria}
          >
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
                          <strong>
                            {parseBilingual(banner.title, locale)}
                          </strong>
                          <small>
                            {strings.rewardCount(banner.pool.length)}
                          </small>
                        </span>
                        <span
                          className={admin.statusBadge}
                          data-status={banner.active ? "ACTIVE" : "DRAFT"}
                        >
                          {banner.active ? strings.active : strings.draft}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.compactEmpty}>
                <h3>{strings.noBanners}</h3>
                <p>{strings.noBannersBody}</p>
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
                      <p>
                        {selectedBanner
                          ? strings.editBanner
                          : strings.newBanner}
                      </p>
                      <h3>
                        {selectedBanner
                          ? parseBilingual(selectedBanner.title, locale)
                          : strings.bannerDetails}
                      </h3>
                    </div>
                    {filters.new ? (
                      <Link
                        className={admin.button}
                        href={`/manage/${boothId}/gacha`}
                      >
                        {strings.cancel}
                      </Link>
                    ) : null}
                  </div>
                  <label className={admin.field}>
                    {strings.bannerTitle}
                    <input
                      name="bannerTitle"
                      defaultValue={selectedBanner?.title ?? ""}
                      maxLength={80}
                      required
                    />
                  </label>
                  <label className={admin.field}>
                    {strings.descriptionLabel}
                    <textarea
                      name="bannerCopy"
                      defaultValue={selectedBanner?.copy ?? ""}
                      maxLength={240}
                      required
                    />
                  </label>
                  <div className={admin.formGridThree}>
                    <label className={admin.field}>
                      {strings.bannerType}
                      <select
                        name="bannerType"
                        defaultValue={selectedBanner?.type ?? "COLLECTION"}
                      >
                        <option value="CHARACTER">{strings.character}</option>
                        <option value="WEAPON">{strings.object}</option>
                        <option value="COLLECTION">{strings.collection}</option>
                      </select>
                    </label>
                    <label className={admin.field}>
                      {strings.theme}
                      <select
                        name="bannerTheme"
                        defaultValue={selectedBanner?.theme ?? "anemo"}
                      >
                        <option value="anemo">{strings.breeze}</option>
                        <option value="ember">{strings.ember}</option>
                        <option value="starlight">{strings.starlight}</option>
                      </select>
                    </label>
                    <label className={admin.field}>
                      {strings.featuredRewards}
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
                      {strings.startsOptional}
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
                      {strings.endsOptional}
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
                      {strings.includeBanner}
                      <small>{strings.includeBannerHelp}</small>
                    </span>
                  </label>
                  <SubmitButton
                    className={admin.buttonPrimary}
                    pendingLabel={strings.savingBanner}
                  >
                    {strings.saveBanner}
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
                        <p>{strings.rewardPool}</p>
                        <h3>{strings.chooseVariants}</h3>
                      </div>
                      <span className={admin.pill}>
                        {strings.selectedCount(selectedEntries.size)}
                      </span>
                    </div>
                    <p className={styles.sectionHelp}>{strings.poolHelp}</p>
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
                                      {parseBilingual(product.name, locale)} ·{" "}
                                      {parseBilingual(variant.label, locale)}
                                    </strong>
                                    <small>
                                      {workspaceStrings.common
                                        .variantStatusLabels[variant.status] ??
                                        variant.status}
                                    </small>
                                  </span>
                                </label>
                                <div className={styles.variantControls}>
                                  <label>
                                    {strings.rarity}
                                    <select
                                      name={`rarity:${variant.id}`}
                                      defaultValue={entry?.rarity ?? "COMMON"}
                                    >
                                      <option value="COMMON">
                                        {strings.common}
                                      </option>
                                      <option value="RARE">
                                        {strings.rare}
                                      </option>
                                      <option value="EPIC">
                                        {strings.epic}
                                      </option>
                                      <option value="LEGENDARY">
                                        {strings.legendary}
                                      </option>
                                    </select>
                                  </label>
                                  <label>
                                    {strings.weight}
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
                                    {strings.featured}
                                  </label>
                                </div>
                              </div>
                            );
                          }),
                        )}
                      </div>
                    ) : (
                      <div className={styles.compactEmpty}>
                        <h3>{strings.noVariants}</h3>
                        <p>{strings.noVariantsBody}</p>
                        <Link
                          className={admin.button}
                          href={`/manage/${boothId}/products?new=1`}
                        >
                          {strings.addProduct}
                        </Link>
                      </div>
                    )}
                    <SubmitButton
                      className={admin.button}
                      pendingLabel={strings.savingPool}
                    >
                      {strings.savePool}
                    </SubmitButton>
                  </form>
                ) : (
                  <p className={styles.helperText}>{strings.saveBannerFirst}</p>
                )}
              </>
            ) : (
              <div className={styles.editorEmpty}>
                <h3>{strings.selectBanner}</h3>
                <p>{strings.selectBannerBody}</p>
                <Link
                  className={admin.buttonPrimary}
                  href={`/manage/${boothId}/gacha?new=1`}
                >
                  {strings.createBanner}
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
            <h2 id="gacha-preview-title">{strings.previewTitle}</h2>
            <p>{strings.previewBody}</p>
          </div>
          <span
            className={admin.statusBadge}
            data-status={compilation.success ? "ACTIVE" : "DRAFT"}
          >
            {compilation.success ? strings.ready : strings.needsAttention}
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
            <h3>{strings.finishDraft}</h3>
            <ul>
              {compilation.errors.map((error) => (
                <li key={error}>
                  {localizeGachaCompilationError(error, strings, (value) =>
                    parseBilingual(value, locale),
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className={styles.publishBar} aria-label={strings.publishingAria}>
        <div>
          <strong>
            {isPublished ? strings.gamePublished : strings.draftPrivate}
          </strong>
          <span>
            {isPublished && config?.publishedAt
              ? strings.publishedAt(formatDateTime(config.publishedAt, locale))
              : strings.publishSnapshot}
          </span>
        </div>
        <div className={styles.publishActions}>
          {isPublished ? (
            <form action={unpublishGachaAction}>
              <input type="hidden" name="boothId" value={boothId} />
              <SubmitButton
                className={admin.button}
                pendingLabel={strings.unpublishing}
              >
                {strings.unpublish}
              </SubmitButton>
            </form>
          ) : null}
          <form action={publishGachaAction}>
            <input type="hidden" name="boothId" value={boothId} />
            <SubmitButton
              className={admin.buttonPrimary}
              pendingLabel={strings.publishing}
              disabled={!compilation.success}
            >
              {isPublished ? strings.publishChanges : strings.publishGame}
            </SubmitButton>
          </form>
        </div>
      </aside>
    </>
  );
}
