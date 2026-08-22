---
name: OakAttest
description: IRAP assessment workspace for assessor firms and their clients.
colors:
  oak-shield: "#0f3f2c"
  oak-shield-hover: "#14543b"
  ink: "#0f172a"
  ink-muted: "#475569"
  ink-soft: "#64748b"
  field-border: "#cbd5e1"
  app-surface: "#f6f8f4"
  panel-surface: "#fffefa"
  danger: "#b91c1c"
  warning-bg: "#fffbeb"
typography:
  headline:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
  title:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0"
  body:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0"
  mono:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
rounded:
  sm: "6px"
  md: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.oak-shield}"
    textColor: "{colors.panel-surface}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.oak-shield-hover}"
    textColor: "{colors.panel-surface}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 16px"
  input-default:
    backgroundColor: "{colors.panel-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "4px 12px"
  card-default:
    backgroundColor: "{colors.panel-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
---

# Design System: OakAttest

## 1. Overview

**Creative North Star: "The Assessment Ledger"**

OakAttest should feel like a precise working ledger for security assessment, calm, clear, and defensible. The new oak shield mark supplies the core visual cue: protection, chain of custody, and institutional trust. The product UI stays restrained so users can focus on roles, evidence, dates, status, and audit records.

This is a light, work-focused interface for assessor teams operating during ordinary business hours on laptops and desktop monitors. The visual system should not chase dramatic cyber aesthetics. It should make complex compliance work feel orderly, not theatrical.

**Key Characteristics:**
- Restrained palette anchored by the oak shield green.
- Warm white panels over a quiet oak-mist application surface.
- Compact forms, predictable navigation, and visible focus states.
- Minimal elevation, mostly borders and tonal layering.
- Direct Australian English copy.

## 2. Colors

The palette is a restrained product palette: readable slate neutrals with a deep oak green used for primary action, current context, and brand presence.

### Primary
- **Oak Shield** (#0f3f2c): Primary action buttons, logo-derived accents, and rare emphasis.
- **Oak Shield Hover** (#14543b): Hover state for primary buttons and high-confidence actions.

### Neutral
- **Assessment Ink** (#0f172a): Headings, primary text, and input text.
- **Muted Slate** (#475569): Body text and secondary labels.
- **Soft Slate** (#64748b): Metadata, helper copy, and subdued navigation.
- **Field Border** (#cbd5e1): Inputs, cards, table dividers, and non-active navigation boundaries.
- **App Surface** (#f6f8f4): Page background and side navigation surrounding area.
- **Panel Surface** (#fffefa): Cards, forms, tables, and authentication panels.

### Tertiary
- **Risk Red** (#b91c1c): Destructive actions and validation errors.
- **Evidence Amber Surface** (#fffbeb): Warnings and backup-code style caution panels.

### Named Rules
**The One Green Rule.** Oak Shield is the only saturated brand colour. Use it for action and identity, not decoration.

**The Readability Rule.** Light fields must always carry Assessment Ink text. Never inherit browser dark-mode body colour into form controls.

## 3. Exports

The canonical runtime export is [`tokens.css`](tokens.css). The equivalent formats below keep the same
Assessment Ledger decisions available to other consumers. Do not edit generated consumers independently.

### CSS custom properties

```css
:root {
  --color-paper: oklch(97% 0.01 145);
  --color-paper-2: oklch(99% 0.008 90);
  --color-paper-3: oklch(94% 0.025 145);
  --color-rule: oklch(86% 0.018 250);
  --color-rule-2: oklch(76% 0.035 150);
  --color-muted: oklch(48% 0.035 258);
  --color-neutral: oklch(38% 0.04 258);
  --color-ink-2: oklch(30% 0.045 258);
  --color-ink: oklch(20% 0.04 265);
  --color-accent: oklch(35% 0.075 155);
  --color-accent-hover: oklch(42% 0.085 155);
  --color-accent-ink: oklch(99% 0.008 90);
  --color-focus: oklch(35% 0.075 155);
  --color-warning: oklch(42% 0.09 75);
  --color-warning-paper: oklch(98% 0.025 90);
  --color-error: oklch(49% 0.18 28);
  --color-success: oklch(40% 0.09 155);
  --font-display: var(--font-geist-sans, Arial), Helvetica, sans-serif;
  --font-body: var(--font-geist-sans, Arial), Helvetica, sans-serif;
  --font-outlier: var(--font-geist-mono, monospace);
  --space-3xs: 0.125rem;
  --space-2xs: 0.25rem;
  --space-xs: 0.5rem;
  --space-sm: 0.75rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2.5rem;
  --space-2xl: 4rem;
  --space-3xl: 6rem;
  --space-4xl: 9rem;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-md: 1.25rem;
  --text-lg: 1.5625rem;
  --text-xl: 1.953rem;
  --text-2xl: 2.441rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 120ms;
  --dur-short: 220ms;
  --dur-long: 420ms;
  --radius-card: 0.5rem;
  --radius-input: 0.375rem;
  --radius-pill: 999px;
}
```

### Tailwind CSS 4 theme

```css
@theme inline {
  --color-paper: var(--color-paper);
  --color-paper-2: var(--color-paper-2);
  --color-paper-3: var(--color-paper-3);
  --color-rule: var(--color-rule);
  --color-muted: var(--color-muted);
  --color-neutral: var(--color-neutral);
  --color-ink: var(--color-ink);
  --color-accent: var(--color-accent);
  --color-accent-hover: var(--color-accent-hover);
  --color-accent-ink: var(--color-accent-ink);
  --color-warning: var(--color-warning);
  --color-error: var(--color-error);
  --color-success: var(--color-success);
  --font-display: var(--font-display);
  --font-sans: var(--font-body);
  --font-mono: var(--font-outlier);
  --spacing-1: var(--space-2xs);
  --spacing-2: var(--space-xs);
  --spacing-3: var(--space-sm);
  --spacing-4: var(--space-md);
  --spacing-6: var(--space-lg);
  --spacing-10: var(--space-xl);
  --spacing-16: var(--space-2xl);
  --spacing-24: var(--space-3xl);
  --radius-sm: var(--radius-input);
  --radius-md: var(--radius-card);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "$type": "color",
    "paper": { "$value": "oklch(97% 0.01 145)" },
    "panel": { "$value": "oklch(99% 0.008 90)" },
    "raised": { "$value": "oklch(94% 0.025 145)" },
    "rule": { "$value": "oklch(86% 0.018 250)" },
    "muted": { "$value": "oklch(48% 0.035 258)" },
    "neutral": { "$value": "oklch(38% 0.04 258)" },
    "ink": { "$value": "oklch(20% 0.04 265)" },
    "accent": { "$value": "oklch(35% 0.075 155)" },
    "accentHover": { "$value": "oklch(42% 0.085 155)" },
    "accentInk": { "$value": "oklch(99% 0.008 90)" },
    "warning": { "$value": "oklch(42% 0.09 75)" },
    "error": { "$value": "oklch(49% 0.18 28)" },
    "success": { "$value": "oklch(40% 0.09 155)" }
  },
  "space": {
    "$type": "dimension",
    "3xs": { "$value": "0.125rem" },
    "2xs": { "$value": "0.25rem" },
    "xs": { "$value": "0.5rem" },
    "sm": { "$value": "0.75rem" },
    "md": { "$value": "1rem" },
    "lg": { "$value": "1.5rem" },
    "xl": { "$value": "2.5rem" },
    "2xl": { "$value": "4rem" },
    "3xl": { "$value": "6rem" },
    "4xl": { "$value": "9rem" }
  },
  "radius": {
    "$type": "dimension",
    "input": { "$value": "0.375rem" },
    "card": { "$value": "0.5rem" },
    "pill": { "$value": "999px" }
  },
  "duration": {
    "$type": "duration",
    "micro": { "$value": "120ms" },
    "short": { "$value": "220ms" },
    "long": { "$value": "420ms" }
  },
  "font": {
    "$type": "fontFamily",
    "body": { "$value": ["Geist", "Arial", "Helvetica", "sans-serif"] },
    "mono": { "$value": ["Geist Mono", "monospace"] }
  }
}
```

### shadcn variables

```css
:root {
  --background: var(--color-paper);
  --foreground: var(--color-ink);
  --card: var(--color-paper-2);
  --card-foreground: var(--color-ink);
  --popover: var(--color-paper-2);
  --popover-foreground: var(--color-ink);
  --primary: var(--color-accent);
  --primary-foreground: var(--color-accent-ink);
  --secondary: var(--color-paper-3);
  --secondary-foreground: var(--color-ink-2);
  --muted: var(--color-paper-3);
  --muted-foreground: var(--color-muted);
  --accent: var(--color-paper-3);
  --accent-foreground: var(--color-accent);
  --destructive: var(--color-error);
  --destructive-foreground: var(--color-accent-ink);
  --border: var(--color-rule);
  --input: var(--color-rule-2);
  --ring: var(--color-focus);
  --radius: var(--radius-card);
}
```

## 4. Typography

**Display Font:** Geist, with Arial, Helvetica, and sans-serif fallback
**Body Font:** Geist, with Arial, Helvetica, and sans-serif fallback
**Label/Mono Font:** Geist Mono for hashes, codes, and compact technical identifiers

**Character:** The type system is native, compact, and administrative. It should feel familiar to people who use professional productivity tools daily.

### Hierarchy
- **Headline** (600, 1.5rem, 1.25): Page titles such as Dashboard, Create your organisation, and Data handling.
- **Title** (600, 1rem, 1): Card titles, table group labels, and panel headings.
- **Body** (400, 0.875rem, 1.5): Form copy, descriptions, table content, and empty states. Prose pages should keep line length near 65 to 75 characters.
- **Label** (500, 0.875rem, 1.25): Form labels, button text, and compact field labels.
- **Mono** (400, 0.75rem, 1.4): Backup codes, storage keys, hashes, and developer-facing identifiers.

### Named Rules
**The No Display Drama Rule.** Do not use oversized marketing typography inside authenticated product screens.

## 5. Elevation

OakAttest uses low elevation. Depth comes from warm white panels on an oak-mist background, 1px borders, and a small shadow on cards. Shadows should help distinguish surfaces, not create visual drama.

### Shadow Vocabulary
- **Card Rest** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): Default card and panel elevation.
- **Command Overlay** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): Command palette or major overlay only.

### Named Rules
**The Flat-By-Default Rule.** Tables, forms, and nav items are bordered or tonal at rest. Reserve heavier shadows for overlays.

## 6. Components

### Buttons
- **Shape:** Compact rounded rectangle, 6px radius.
- **Primary:** Oak Shield background, warm white text, 36px height, 16px horizontal padding.
- **Hover / Focus:** Hover shifts to Oak Shield Hover. Focus uses a 2px Oak Shield ring.
- **Outline / Ghost:** Panel or transparent backgrounds, slate text, subtle oak-mist hover surface.

### Cards / Containers
- **Corner Style:** 8px radius.
- **Background:** Panel Surface on App Surface.
- **Shadow Strategy:** Card Rest shadow only.
- **Border:** 1px Field Border.
- **Internal Padding:** 24px on full cards, 12px to 16px on dense inline panels.

### Inputs / Fields
- **Style:** Panel Surface background, Field Border, 6px radius, Assessment Ink text.
- **Focus:** 2px Oak Shield focus ring. Do not remove focus visibility.
- **Error / Disabled:** Error text uses Risk Red. Disabled controls reduce opacity and block pointer events.

### Navigation
- **Style:** Left sidebar on desktop, Panel Surface, 1px border, compact links.
- **Default:** Slate text with muted icons.
- **Hover / Active:** Oak-mist hover surface. Active state should add stronger text weight or a subtle tonal fill, not a coloured side stripe.
- **Branding:** Use the OakAttest logo lockup at the top of auth and app shells.

### Logo
- **Assets:** `/public/oak-attest-mark.png` for product chrome and `/public/oak-attest-logo-lockup.png` for README or larger brand moments.
- **Use:** Product surfaces use the shield mark plus live OakAttest text so it scales cleanly in compact layouts.
- **Treatment:** Keep the logo on light surfaces. Do not recolour or place it on dark or high-noise backgrounds.

## 7. Do's and Don'ts

### Do:
- **Do** use Oak Shield (#0f3f2c) only for primary actions, identity, and rare emphasis.
- **Do** keep product surfaces light, cool, and readable.
- **Do** use compact, familiar form and table patterns.
- **Do** preserve visible keyboard focus states.
- **Do** write direct Australian English copy for security, residency, and chain-of-custody obligations.

### Don't:
- **Don't** use neon security styling, terminal theatrics, or purple-blue gradients.
- **Don't** use glassmorphism or decorative blur on product surfaces.
- **Don't** use coloured side stripes greater than 1px on cards, alerts, or nav items.
- **Don't** assume email delivery is mandatory for self-installed deployments.
- **Don't** let form controls inherit unreadable dark-mode text colours.
