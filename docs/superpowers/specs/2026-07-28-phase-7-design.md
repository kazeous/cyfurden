# Phase 7 — Parity Fix-Now Slice Design

**Date:** 2026-07-28  
**Status:** Approved for implementation planning  
**Roadmap:** `local-docs/IMPLEMENTATION_PLAN.md` Phase 7  
**Approach:** Fully isolated slice; no Phase 8–13 seams or infrastructure

## 1. Purpose and scope

Phase 7 completes the approved fix-now slice across five existing surfaces:

- **G-4 — Cart UX:** explicit per-line removal, clear-all, a sticky desktop cart summary, and product-card SKU chips.
- **G-5 (event-free subset) — Orders polish:** a booth-readiness checklist and a Today shortcut using a fixed `Asia/Ho_Chi_Minh` day boundary.
- **G-7 — Dashboard detail:** an owned-booth usage counter and a note that joined booths do not count toward the five-booth limit.
- **G-8 — Runtime defects:** all three storefront mojibake glyphs, the duplicated reservation-title suffix, and retention of the existing DOM-only centered social-QR logo treatment.
- **G-9 — Dead/stale cleanup:** remove unused or unread code, normalize new gacha-rate defaults, retain Phase 9 promotion code, and document the required SKU contract.

Phase 7 introduces no database schema changes, migrations, queues, external services, or new infrastructure. It does not begin Phase 8 localization, Phase 9 promotion application, Phase 10 events/live polling, Phase 11 admin-shell work, Phase 12 public gacha, or Phase 13 demo-booth work.

## 2. Architectural boundaries

### 2.1 Public storefront

`components/storefront/managed-storefront.tsx` remains the owner of device-local cart state and mutations. New cart operations use the existing update wrapper so they preserve local-storage persistence, idempotency-key rotation, derived count/total updates, and the existing reservation submission contract.

The public storefront query exposes `Product.sku` only for display. Variant SKU and SKU values do not enter cart lines, local storage, reservation input, or order snapshots. Public cart lines remain:

```ts
{
  productId: string;
  variantId: string;
  quantity: number;
}
```

### 2.2 Orders operations

Two isolated pure units support the Orders changes:

1. A checklist evaluator receives authorized booth, storefront, payment, and product facts and returns typed complete/incomplete items.
2. A date helper converts “today in `Asia/Ho_Chi_Minh`” to a half-open UTC interval.

The Orders page remains URL-driven. The Today filter does not change order status, pagination, lazy expiry, events, or refresh behavior.

### 2.3 Dashboard

Owned-booth usage is derived from `Booth.ownerId === currentUser.id`. Membership roles are not used to infer ownership. Joined booths remain visible but never consume the five-owned-booth allowance.

### 2.4 Cleanup

Defect fixes and stale-code cleanup stay local to their current files. Existing Phase 9 promotion actions and data remain intentionally inert. Gacha-rate normalization affects defaults for newly created missing records only and does not expose gacha publicly or rewrite persisted JSON.

## 3. Public storefront and cart UX

### 3.1 Product SKU chip

The public booth query adds `Product.sku` to the existing product DTO. Both featured and catalogue product cards render it as a compact neutral chip next to existing Featured and availability badges.

The chip is display-only and non-interactive. Product-level SKU is canonical for a card that may represent multiple variants. Variant SKUs remain internal.

Implementation must verify and document the existing runtime SKU contract exactly: normalization, regex, and uniqueness scope come from the current product form/action and database constraints rather than being redefined for Phase 7.

### 3.2 Cart mutations

The storefront adds two explicit operations:

```ts
removeLine(variantId: string): void
clearCart(): void
```

Both delegate to the existing `updateCart` wrapper, preserving state persistence and idempotency-key rotation.

The existing decrement control remains a quantity adjustment. Decrementing quantity one removes the line, matching current behavior. A separate trash control removes the complete line immediately regardless of quantity.

“Clear bag” appears once in the cart drawer header or directly above the lines. It is disabled while reservation submission is pending. It acts immediately without a confirmation dialog because the cart is device-local, no transaction has completed, and products remain recoverable from the catalogue.

### 3.3 Focus and announcements

After per-line removal, focus moves to:

1. the next cart line’s first control;
2. otherwise the previous line’s first control;
3. otherwise the empty-cart message or close control.

After clear-all, focus moves to the programmatically focusable empty-cart message. One polite live region announces cart mutations without announcing incidental rerenders.

Trash controls have accessible names that include the product and variant. All new interactive controls preserve 44 px touch targets and visible focus.

### 3.4 Sticky desktop summary

At desktop widths where the storefront uses its two-column grid, the side-column cart summary uses `position: sticky` with an inset below the sticky top bar and remains bounded by its grid containing block.

At `max-width: 860px`, the cart summary explicitly resets to normal document flow:

- `position: static`;
- no sticky inset;
- no viewport maximum height;
- no internal scrolling region.

The existing drawer remains the detailed editing surface. The summary does not duplicate trash or clear-all controls.

## 4. Orders checklist and Today filter

### 4.1 Checklist data and rules

A pure checklist evaluator uses already-authorized booth facts. It returns the following five items:

| Item                             | Completion rule                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Publish at least one product     | At least one product is `LIVE`                                                                        |
| Configure payment details        | Required payment fields are complete under the same predicate used by the reservation/payment handoff |
| Provide a booth name             | Published storefront `identity.name` is non-empty after trim                                          |
| Provide a booth description      | Published storefront `identity.description` is non-empty after trim                                   |
| Provide event location and hours | Published `eventLocation` and `eventHours` are each non-empty after trim                              |

Payment readiness must reuse the existing canonical predicate rather than duplicate or weaken it. The evaluator does not inspect images, variant count, or inventory quantity.

The checklist card renders only while at least one item is incomplete. It disappears automatically when all five items are complete. No dismissal state is stored.

### 4.2 Today semantics

The application-wide Phase 7 definition of Today is the calendar day in `Asia/Ho_Chi_Minh` (UTC+07:00). No booth timezone field is added.

The helper produces a half-open UTC interval:

```text
createdAt >= startOfTodayInHoChiMinh
createdAt < startOfTomorrowInHoChiMinh
```

The Orders URL recognizes a dedicated Today state, represented as the query parameter `today=1`. Today is mutually exclusive with explicit date-from/date-to values; when both are present, Today wins and the explicit range is ignored.

The Today control appears beside the existing date controls. Activating it sets Today and clears explicit date inputs in the visible state and URL. Leaving Today clears the Today state. Pagination and status filters remain intact.

## 5. Dashboard counter

The dashboard displays a compact owned-booth usage line near the create-booth action:

> **2 of 5 booths used**

When the user has joined booths, supporting copy states:

> Joined booths do not count toward this limit.

The numerator counts only booths whose `ownerId` equals the current user ID. The existing server-side serializable cap remains authoritative; the counter is explanatory UI and cannot grant creation permission.

## 6. Runtime defect fixes

### 6.1 Mojibake

All three known double-encoded storefront glyphs are corrected:

- product-detail close: `Ã—` → `×`;
- product-detail decrement: `âˆ’` → `−`;
- booth-info close: `Ã—` → `×`.

Existing accessible names remain unchanged. A source-level regression assertion checks user-facing source for common mojibake sequences.

### 6.2 Reservation title

The reservation page’s metadata title becomes `Reservation received`. The root layout’s `%s · Cyfurden` template remains unchanged, producing exactly:

> Reservation received · Cyfurden

### 6.3 Social QR logo

Phase 7 retains the existing DOM-only centered booth-logo overlay on the social QR. It appears only when a booth logo exists, remains hidden from assistive technology, and does not alter QR generation or downloading.

Phase 7 does not add canvas compositing, image fetching, or CORS handling. It does not change payment VietQR.

## 7. G-9 cleanup

### 7.1 Gacha-rate defaults

A single typed canonical default replaces divergent creation defaults:

```ts
export const DEFAULT_GACHA_RATES = {
  common: 70,
  rare: 24,
  epic: 5,
  legendary: 1,
} as const;
```

This lowercase 100-point distribution applies only when new missing gacha records are created. Existing persisted JSON is not migrated or rewritten. Readers remain tolerant of legacy uppercase keys until Phase 12 defines the final odds editor and migration strategy.

This normalization is an accepted Phase 7 behavior change but does not connect gacha to the public storefront.

### 7.2 Dead and stale code

Phase 7 removes:

- unused `MetricCard` code;
- `?new=1` from links and redirects where no destination reads it;
- empty legacy directories only after confirming they contain no tracked or ignored useful assets.

Phase 7 retains:

- `savePromotionAction` for Phase 9;
- existing promotion schema, defaults, and data;
- generated Prisma output unless a legitimate generation command changes it.

Empty untracked directories do not form part of the committed diff.

### 7.3 Required SKU contract

This design records that product SKU is intentionally required. Implementation documentation must quote the actual runtime and database rules after verifying them:

- normalization behavior;
- accepted pattern;
- uniqueness scope;
- product SKU as the public card label;
- variant SKU remaining internal;
- no SKU in public cart or reservation payloads.

## 8. Error handling

- Cart mutations remain synchronous and device-local. Invalid persisted lines continue to be discarded by the existing hydration validation.
- Removing or clearing while an order is pending is prevented through disabled controls.
- Focus fallback handles the last-line removal case without targeting a detached node.
- The Today helper accepts an injectable reference time in tests; production uses the server request time. Invalid or conflicting date query values fall back to existing validated behavior, with Today taking precedence only when explicitly valid.
- Missing checklist data produces an incomplete checklist item rather than an exception.
- Missing booth logos preserve the plain social QR.
- Legacy gacha-rate shapes remain readable; normalization does not rewrite them.

## 9. Testing and verification

### 9.1 Standard gates

All Phase 7 changes must pass:

```bash
npm run format:check
```

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npx prisma validate
```

No migration is introduced.

### 9.2 Unit and source-level coverage

Tests cover:

- explicit line removal;
- clear-all;
- idempotency-key rotation through the existing cart mutation wrapper;
- persisted-cart shape remaining unchanged;
- checklist completion/incompletion for every item;
- reuse of the canonical payment-readiness predicate;
- checklist hidden when complete;
- `Asia/Ho_Chi_Minh` Today boundaries at local midnight, one instant before the next day, and the next day boundary;
- Today query precedence over explicit date inputs;
- owned-booth counting independent of memberships;
- common mojibake-source patterns absent;
- reservation metadata contains no duplicated `Cyfurden` suffix;
- new gacha records use the canonical default while legacy JSON remains accepted.

Existing rendered-HTML tests are extended where they already pin source wiring. Pure helpers receive focused unit suites. The implementation should not introduce a new test framework solely for Phase 7; use the existing Node test/TSX stack.

### 9.3 Integration regression

The Phase 4 integration suite confirms the public reservation payload remains `{ productId, variantId, quantity }` and order-item snapshots remain unchanged despite exposing product SKU for card display.

Phase 5 and Phase 6 integration suites continue to pass unchanged.

### 9.4 Browser smoke

Use a disposable PostgreSQL 16 database and exercise:

1. sign-up → booth → LIVE product with required SKU → publish;
2. desktop public booth: SKU chip visible, sticky cart summary remains usable, add/decrement/remove/clear-all work, focus and announcement behavior remain coherent;
3. mobile (`≤390px`): summary is static, drawer controls remain usable, no horizontal overflow;
4. dashboard: correct owned count and joined-booth note;
5. Orders on an incomplete booth: five-item checklist visible;
6. complete all readiness items: checklist hidden;
7. Today: only records in the `Asia/Ho_Chi_Minh` calendar day appear, including near-midnight boundaries;
8. reservation route: browser title has exactly one `· Cyfurden` suffix;
9. product and booth-info dialogs: correct close/decrement glyphs;
10. browser console remains free of errors.

## 10. Acceptance criteria

Phase 7 is accepted when:

- all standard gates pass;
- the existing reservation wire contract and manual-payment boundary are unchanged;
- cart trash, clear-all, sticky desktop summary, mobile reset, and product SKU chips work accessibly;
- owned-booth usage and joined-booth guidance are accurate;
- checklist visibility and Today filtering match the rules above;
- all known mojibake and title defects are fixed;
- the social QR logo remains a DOM-only overlay;
- new gacha defaults use one canonical lowercase 100-point shape without rewriting existing records;
- dead/stale cleanup removes only proven-unused code and preserves Phase 9 promotion work;
- desktop and `≤390px` browser smoke passes with no console errors;
- `local-docs/PROGRESS.md` is updated with changed files, verification evidence, decisions, risks, and the next recommended task.
