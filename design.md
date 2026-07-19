# Design — Cyfurden

A locked visual system for Cyfurden’s public booth and management workspace.
Every route keeps this system; app pages vary by information shape, not theme.

## Genre

Editorial-utilitarian. The storefront carries the handmade warmth; management
screens prioritise speed, legibility, and honest operational feedback.

## Macrostructure family

- Public storefronts: Catalogue — products and convention context are the proof.
- App pages: Workbench for the visual designer; Index-First for resource queues.
- Auth and invitations: Split Studio with one focused form or decision.

## Theme

- Paper: warm off-white with cool-neutral workspace surfaces.
- Ink: navy rather than pure black.
- Selection accent: coral, used for focus, active navigation, and selected blocks.
- Action accent: forest green, reserved for primary save/create actions.
- State colours always pair colour with text, icon, or status copy.

Canonical OKLCH values live in `tokens.css`.

## Typography

- Display: Georgia / Times fallback, weight 400–700, roman only.
- Body: the established Inter-led UI stack, weight 400–800.
- Display tracking: `-0.04em` for page titles.
- UI body floor: 14 px; core explanations use 14–16 px.

The existing pairing is preserved to avoid an unplanned font-loading dependency.

## Spacing

The 4-point named scale in `tokens.css` is canonical. App surfaces use varied
8 / 12 / 16 / 24 / 40 px gaps rather than equal padding everywhere.

## Motion

- State changes use `--ease-out`; exits use `--ease-in`.
- Only transform and opacity animate.
- Drag-and-drop, pressed buttons, and selected tabs may move; content does not
  animate merely because it entered the viewport.
- Reduced motion collapses spatial feedback to 150 ms or less.

## Microinteractions stance

- Focus is immediate and visible.
- Successful changes update in place; errors remain beside the action.
- Copy-to-clipboard changes its own label to “Copied”.
- Preview selection is click-first; drag starts only from a labelled handle.
- Reordering always has keyboard-accessible arrow controls.

## CTA voice

- Primary: forest fill, compact rectangle, a concrete verb (“Save changes”).
- Secondary: paper surface with a hairline rule.
- Destructive: explicit red treatment and plain-language consequence.

## Per-page allowances

- App pages use no decorative enrichment; function carries the page.
- Public catalogue imagery comes from Oracle Object Storage.
- Empty states stay compact and present one useful next action only.

## What pages MUST share

- Cyfurden wordmark and two-font hierarchy.
- Coral selection and forest action semantics.
- 44 px touch targets, visible focus, and one-line affordance labels.
- A persistent desktop sidebar and compact mobile top/bottom navigation.
- Inline validation that preserves user input.

## What pages MAY differ on

- Tables on desktop may become resource cards on mobile.
- A true visual editor may use a two-pane Workbench layout.
- Metrics appear only when they communicate non-zero operational information.

## Exports

### tokens.css

The production export is [`tokens.css`](./tokens.css).

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(96.5% 0.012 85);
  --color-ink: oklch(31% 0.055 255);
  --color-accent: oklch(52% 0.16 20);
  --font-display: Georgia, "Times New Roman", serif;
  --font-body: Inter, ui-sans-serif, system-ui, sans-serif;
  --spacing-md: 1rem;
  --text-md: 1.25rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper": { "$value": "oklch(96.5% 0.012 85)", "$type": "color" },
    "ink": { "$value": "oklch(31% 0.055 255)", "$type": "color" },
    "accent": { "$value": "oklch(52% 0.16 20)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Georgia", "$type": "fontFamily" },
    "body": { "$value": "Inter", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 96.5% 0.012 85;
  --foreground: 31% 0.055 255;
  --primary: 49% 0.105 140;
  --primary-foreground: 99% 0.004 85;
  --muted: 94.8% 0.009 245;
  --muted-foreground: 56% 0.035 255;
  --border: 89% 0.015 245;
  --input: 89% 0.015 245;
  --ring: 55% 0.17 20;
  --radius: 0.75rem;
}
```
