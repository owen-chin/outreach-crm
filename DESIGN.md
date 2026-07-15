---
name: Longlist
description: A CRM where sponsorship-outreach status tracking and real email correspondence live on one desk.
colors:
  bg: "#f6f5fb"
  surface: "#ffffff"
  surface-soft: "#eeedf6"
  border: "#e4e2ec"
  text: "#17171f"
  text-muted: "#5c5c6b"
  text-faint: "#74748a"
  bg-dark: "#050506"
  surface-dark: "#17171b"
  surface-soft-dark: "#1e1e23"
  border-dark: "#2b2b31"
  text-dark: "#f5f5f7"
  text-muted-dark: "#a1a1a6"
  text-faint-dark: "#6e6e73"
  working-indigo: "#5b3df0"
  glow-cyan: "#00b4e0"
  glow-pink: "#ff3d9a"
  accent-violet: "#7c3aed"
  accent-blue: "#2563eb"
  accent-emerald: "#059669"
  accent-rose: "#e11d48"
  accent-amber: "#d97706"
  danger: "#ef4444"
  danger-dark: "#f87171"
  status-contacted: "#2563eb"
  status-responded: "#d97706"
  status-negotiating: "#ea580c"
  status-confirmed: "#059669"
  status-declined: "#dc2626"
  avatar-cyan: "#0891b2"
  avatar-pink: "#db2777"
typography:
  display:
    fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  "2xl": "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
components:
  button-primary:
    backgroundColor: "{colors.working-indigo}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, {colors.working-indigo} 85%, black)"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  badge:
    backgroundColor: "color-mix(in srgb, {colors.status-confirmed} 18%, {colors.surface})"
    textColor: "color-mix(in srgb, {colors.status-confirmed} 65%, {colors.text})"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "20px"
  form-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Longlist

## 1. Overview

**Creative North Star: "The Unified Desk"**

Longlist exists because status tracking and actual correspondence are usually two separate tools — a spreadsheet in one tab, Gmail in another. The Unified Desk means every screen puts both on the same surface: the structured layer (project → category → org, status pipeline, kanban columns) is never more than one glance or one click from the real email thread it describes. Board view, inbox view, and dashboard are three lenses on the same underlying data, not three destinations.

The visual language carries that job with more confidence than the original MVP skin: crisp and fast, but with a cinematic, "keynote stage" polish — a richer violet accent, a soft multi-hue glow on arrival screens, and a deliberate glow on the handful of elements that are actually colored (primary actions, active state, counts). It still explicitly rejects the cutesy-consumer-app register: no illustration, no mascots, no emoji-driven UI. The richness lives in light, color, and glow — never in ornament.

**Key Characteristics:**
- Every status signal (badge, dot, column) sits beside a direct path into the real thread — never status-only, never email-only
- Dense by design on working screens: a long list is meant to look long, not padded out to feel spacious
- Cards stay flat and quiet; glow is reserved for colored, functional elements (primary buttons, active status, counts) — never for a plain surface
- Arrival screens (Home, Login) carry a soft multi-hue background bloom; dense working screens (kanban, inbox, settings) stay plain
- One accent color carries all functional signal (action, selection, current view); two fixed atmosphere hues (cyan, pink) exist only in the background bloom, never on functional UI
- Two-voice typography: Space Grotesk for identity/orientation moments, plain system sans for everything the user actually works in

## 2. Colors

Restrained by default: neutral surfaces carry the interface, one accent marks what's actionable, and a five-color semantic ramp marks pipeline status. Every dark-mode value is a hand-tuned counterpart, not an inverted filter.

### Primary
- **Working Indigo** (`#5b3df0`): the fixed brand accent — richer and more saturated than the original MVP indigo. Marks primary buttons, active nav/tab state, focus rings, links, and the current kanban drag target. Not user-configurable: the accent color picker that shipped with the original MVP theme system was removed by deliberate choice, so this is the one accent, everywhere, permanently. Every derived shade (`hover`, `-soft`, `-border`, `-deep`) is still computed from it via `color-mix()`. The same single hex is used in both light and dark mode; only the surface it sits against changes.

### Atmosphere — Fixed Glow Hues
- **Glow Cyan** (`#00b4e0`) and **Glow Pink** (`#ff3d9a`): not user-swappable, not tied to accent choice. Exist only inside the background bloom on arrival screens (Home dashboard, Login) alongside the current accent, giving the entry point a richer, multi-hue "keynote stage" glow. Never appear on buttons, badges, text, or any functional element — that boundary is what keeps them decorative rather than confusing them with status or accent meaning. Distinct from the (also fixed) avatar-palette cyan/pink below — different purpose, deliberately different shades.

### Secondary — Status Pipeline
The five-stage read on where an organization sits, used for badges, kanban column dots, and progress-bar segments:
- **Contacted Blue** (`#2563eb`): first outreach sent
- **Responded Amber** (`#d97706`): they replied
- **Negotiating Orange** (`#ea580c`): active back-and-forth
- **Confirmed Emerald** (`#059669`): closed, won
- **Declined Red** (`#dc2626`): closed, lost
- `not_contacted` intentionally carries no hue — it renders in neutral `border`/`text-muted`, so color only turns on once something has actually happened.

### Neutral
- **Paper** (`#f6f5fb` / dark `#050506`): page background — a faint violet-tinted near-white in light mode, a near-black richer than the original MVP dark in dark mode
- **Surface** (`#ffffff` / dark `#17171b`): cards, topbar, modals, panels
- **Surface Soft** (`#eeedf6` / dark `#1e1e23`): secondary layer for rails, search inputs, kanban column bodies — one step cooler than Surface
- **Border** (`#e4e2ec` / dark `#2b2b31`): all dividers and card outlines
- **Ink** (`#17171f` / dark `#f5f5f7`): primary text
- **Ink Muted** (`#5c5c6b` / dark `#a1a1a6`): secondary text, metadata
- **Ink Faint** (`#74748a` / dark `#6e6e73`): tertiary labels, timestamps, disabled-adjacent text
- **Alert Red** (`#ef4444` / dark `#f87171`): destructive actions, error text

### Tertiary — Identity Avatars
- **Avatar Set** (`#5b3df0`, `#0891b2`, `#059669`, `#d97706`, `#7c3aed`, `#db2777`): hash-assigned per person/organization name, purely for at-a-glance identification in dense lists — not user-configurable, not tied to status or brand. Its cyan and pink are separate, slightly deeper shades than the Atmosphere hues above — a deliberate distinction, not an inconsistency.

### Named Rules
**The Working Indigo Rule.** The accent appears only on primary actions, current selection, and functional status signal. It is never used purely decoratively (background washes, illustration, dividers) — the soft glow it now carries on those same elements (see Elevation §4) is still functional signal, not ornament. If a use of the accent can't be explained as "this is clickable" or "this is currently selected," it's wrong.

**The One Desk Rule.** A status color never appears without a path to the thread it describes, within one click. A kanban card, org row, or dashboard tile that shows status but not a route into the actual email fails this rule.

## 3. Typography

**Display Font:** Space Grotesk (500/600/700), with system sans fallback
**Body Font:** System sans stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)

**Character:** A two-track pairing, not a display/body blend. Space Grotesk is reserved for orientation moments — it tells you where you are. Everything you actually work in — buttons, tables, forms, email content — stays in the plain system sans so the interface never competes with the task.

### Hierarchy
- **Display** (700, 23px, 1.2 line-height, Space Grotesk): the home dashboard greeting — appears once per session, orientation only.
- **Headline** (700, 17–22px, 1.3 line-height, Space Grotesk): page `h1`s, project subheader titles, inbox center-pane headers, project/org names on dashboard cards.
- **Title** (600, 15px, 1.3 line-height, system sans): card titles, modal titles, template names, detail-card headers.
- **Body** (400, 14px, 1.5 line-height, system sans): default UI text, form inputs, notes, email body preview. Cap prose (notes, email content) at 65–75ch.
- **Label** (600–700, 10.5–12px, 1.4 line-height, system sans, `0.02–0.04em` tracking on uppercase variants only): stat labels, status tags, badges, tab counts, section eyebrows inside cards (e.g. "NOTES").

### Named Rules
**The Two-Voice Rule.** Space Grotesk appears only in headings and identity moments (brand mark, page titles, dashboard stat values). The moment a font choice reaches a button, badge, table cell, or form control, it must be the system sans. Mixing the two anywhere else breaks the sharp-and-efficient component feel.

## 4. Elevation

Two different rules for two different kinds of element, and the boundary between them is deliberate. **Cards and surfaces stay flat-by-default**: a 1px `border` at rest, shadow earned only by hover or by floating context (dropdown, modal) — never an ambient glow, never a colored tint. **Colored, functional elements carry a soft ambient glow even at rest**: the primary button, the active status pill, the attention-count badge. The glow is how Longlist signals "this is the one thing that's actually colored on this screen" — it never spreads to a neutral surface.

### Shadow Vocabulary
- **Resting Card** (`box-shadow: 0 1px 3px rgba(23,18,40,0.07)` light / `rgba(0,0,0,0.3)` dark): default state for `.card`, `.template-card`, `.settings-card`, `.project-row`. Neutral, never accent-tinted.
- **Card Hover** (`box-shadow: 0 4px 12px rgba(0,0,0,0.1)`): hover feedback on clickable list/template cards. Still neutral — hover deepens the shadow, it doesn't colorize it.
- **Ambient Glow** (`box-shadow: 0 4px 14px -4px color-mix(in srgb, var(--accent) 45%, transparent)`, hover `55%`): the primary button. Same formula, tighter radius (`0 0 12px -3px … 55%`), on the active status pill and the attention-count badge. This is the one place a *resting* (non-hover) shadow is correct, precisely because the element itself is accent-colored.
- **Dropdown** (`0 20px 50px -12px rgba(60,30,110,.28)` topbar / `0 12px 30px -8px rgba(0,0,0,.2)` inline menus): floating menus, unchanged.
- **Modal** (`0 20px 60px rgba(0,0,0,0.2)`): modal content over the dimmed overlay, unchanged.
- **Arrival Bloom** (three soft `radial-gradient` layers — accent, Glow Cyan, Glow Pink — each `color-mix(… X%, transparent)` into the page background): scoped to `.home-layout` and `.login-page` only. This is atmosphere, not a shadow token, but it lives in the same "where does color glow live" logic — see §2 Atmosphere. **Light and dark are intentionally asymmetric, not mirrored:** light mode is very subtle (8–13%) — confirmed directly by the user after a first pass was too vivid and made the plain white project cards look like they were "popping out" against it. Dark mode stays richer (22–36%), since a glow needs more presence to read against near-black at all. Never bring light mode's opacity up to match dark's; that's the mistake already corrected once.

### Named Rules
**The Flat-by-Default Rule.** Nothing floats at rest *if it's a plain surface*. A shadow on a neutral card is only correct as a direct response to hover or to leaving the page's normal stacking context.

**The Ambient Glow Rule.** A resting (non-hover) shadow is only correct on an element that is itself accent-colored — never on a neutral surface, and never as decoration on something that isn't already functionally "the colored thing" on screen.

## 5. Components

Sharp and efficient: compact, no wasted motion, every state accounted for, nothing decorative.

### Buttons
- **Shape:** 8px radius (`rounded.md`) at every size, including `.btn-sm`.
- **Primary:** Working Indigo background, white text, `7px 14px` padding, 13px/500 system sans. Hover darkens via `color-mix(in srgb, accent 85%, black)`, and carries the Ambient Glow shadow (see Elevation §4) at rest, deepening slightly on hover — the one button variant allowed a resting shadow.
- **Danger:** background is `color-mix(danger 18%, surface)`, text `danger` at full value; hover intensifies the mix to 30%. No glow — danger is a warning color, not the accent, and Ambient Glow is accent-only.
- **Ghost:** transparent background, 1px `border`, `text` color; hover fills with `bg`. No glow — it isn't accent-colored at rest.
- All variants: `disabled` drops to 0.5 opacity and blocks the pointer; no button ever animates on click beyond the background transition.

### Chips / Badges
- **Style:** pill radius (`9999px`), `2px 8px` padding, 12px/500 label type.
- **State:** background = `color-mix(hue 18%, surface)`, text = `color-mix(hue 65%, text)` — every semantic color (status badges, `success-msg`, `warn-msg`, dropdown "connected" badge) follows this exact formula, which is why contrast holds automatically in both themes without per-color dark-mode overrides.
- **Glow exception:** `.status-tag-active` and `.attention-count` are accent-colored (not semantic-status-colored), so they carry the Ambient Glow shadow. Semantic status badges (confirmed/declined/etc.) do not glow — glow is reserved for the accent, not the five-color status ramp.

### Cards / Containers
- **Corner Style:** 8px for workaday list cards (`.card`, `.template-card`); 12–14px for dashboard-level or "featured" surfaces (`.home-project-card`, `.board-column`, `.attention-card`, `.detail-card`). The larger radius is the visual cue that a surface is a dashboard destination, not a row in a list.
- **Background:** `surface`.
- **Shadow Strategy:** see Elevation — Resting Card + Card Hover for clickable cards; border-only (no shadow at all) for dense list rows like `.person-card` and `.thread-message`.
- **Border:** 1px `border`, always present regardless of shadow state.
- **Internal Padding:** 12–14px for compact list cards, up to 20px for dashboard/featured cards.

### Inputs / Fields
- **Style:** 1px `border`, 8px radius, `surface` background, `8px 12px` padding, 14px system sans.
- **Focus:** border switches to the accent color plus a `0 0 0 3px accent-soft` glow ring. No scale, no layout shift.
- **Error:** error text renders below the field in `danger` at 13px; there is currently no bordered/highlighted error state on the input itself — worth adding if form validation gets stricter.

### Navigation
- **Topbar:** 57px fixed height, sticky top, `surface` background, 1px bottom border, `z-index: 20`.
- **Nav links:** 13px/500, `text-muted` at rest; active state gets `accent-soft` background, `accent` text, and 600 weight — no underline, no bottom-border tab indicator.
- **User chip:** pill-shaped avatar + name + caret; opens a dropdown using the tinted Dropdown shadow.

### The Unified Desk (signature pattern)
The literal expression of the One Desk Rule, in two forms:
- **Kanban board:** columns are `surface-soft` containers (14px radius) holding `surface` cards (11px radius). Dragging over a column swaps its background to `accent-soft` with an `accent` border — instant, zero-choreography feedback. Each card carries category, status color, and a contact avatar, and opens straight into the org's real thread on click.
- **Inbox (three-pane):** org-list sidebar (with an inline status dot per row) → thread list/detail center pane → context rail. The status dot means pipeline state is always visible without ever leaving the correspondence view.

## 6. Do's and Don'ts

### Do:
- **Do** keep Working Indigo to primary actions, current selection, and status/functional signal only — never pure decoration (**The Working Indigo Rule**).
- **Do** pair every status indicator with a one-click path to the real email thread it describes (**The One Desk Rule**).
- **Do** leave cards and surfaces flat at rest; shadow there only on hover or for floating/overlay elements (**The Flat-by-Default Rule**).
- **Do** give accent-colored functional elements — primary buttons, active status pills, count badges — a soft resting glow (**The Ambient Glow Rule**); nothing else gets one.
- **Do** keep the arrival-screen bloom (Home, Login) to those two screens; dense working screens (kanban, inbox, settings) stay plain.
- **Do** keep light mode's arrival bloom far more subtle than dark's (8–13% vs 22–36% into the background) — asymmetric on purpose, not mirrored.
- **Do** default every new session to light mode, regardless of the visitor's OS-level dark-mode preference.
- **Do** keep Space Grotesk confined to headings and identity moments; system sans everywhere functional (**The Two-Voice Rule**).
- **Do** derive semantic and status colors via `color-mix()` toward `surface`/`text` rather than fixed hex values, so they stay correct across both themes automatically.

### Don't:
- **Don't** add illustration, mascots, or emoji-driven UI — PRODUCT.md names "cutesy consumer app" styling as the explicit anti-reference.
- **Don't** put a glow or colored shadow on a plain white/dark card — confirmed directly by the user after a first pass overdid it: glow belongs on colored elements only, never on a neutral surface.
- **Don't** raise light mode's arrival-bloom opacity to match dark's — a first pass at 30–46% made the plain white project cards look like they were popping out; corrected to 8–13% after direct user feedback.
- **Don't** reintroduce a user-facing accent color picker. It shipped in the original MVP theme system and was deliberately removed — the accent is fixed now.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe on cards or list rows.
- **Don't** add decorative motion. Motion here exists only to convey state: drag-over, hover, focus, toggle — nothing plays on page load.
- **Don't** introduce a second display font, or pair Space Grotesk with anything other than the system sans.
- **Don't** let the Atmosphere hues (Glow Cyan, Glow Pink) leak onto functional UI — they exist only inside the arrival bloom.
- **Don't** hide an org or thread behind pagination or an "archive" that removes it from every list/board view — the working list stays whole and visible.
