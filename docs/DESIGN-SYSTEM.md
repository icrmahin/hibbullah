# Design system — the rules every screen follows

This is the contract for the UI. Screens and components conform to it; nothing re-invents
its own header, card, type scale or bottom padding.

## The intent

Clean, bright, spacious, restrained, commercial. A consumer pharmacy app — not an admin
dashboard that grew a phone layout. Neutral surfaces carry the interface; deep green is an
*action* colour, not a wallpaper. Every screen looks deliberately composed: tight header,
one gutter, one type scale, one card vocabulary.

---

## 1. Screen skeleton

```tsx
<Screen header={<ScreenHeader title="Orders" onBack={goBack} />}>
  {/* body: ScrollView / FlashList / form */}
</Screen>
```

- `Screen` owns the page background (`colors.background`) and, **only when there is no
  header**, the top safe-area inset.
- `ScreenHeader` owns the top inset when it is present. Never pad `insets.top` yourself and
  never wrap a header screen in `SafeAreaView` — that is the double-inset bug that put
  ~100px of dead space above every content area.
- Early-return states keep the same skeleton:

  ```tsx
  if (loading) return <Screen header={<ScreenHeader title="Orders" onBack={goBack} />}><LoadingState label="Loading orders" /></Screen>;
  ```

  The header is repeated per branch — that is fine and intentional; a state branch is a
  whole screen, not a fragment.

- Bottom padding for scrollable content: `useBottomInset()`.

  ```tsx
  const bottomInset = useBottomInset();
  <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}>
  ```

  Never `Math.max(insets.bottom, …) + 24` — the bottom nav absorbs the device inset already.

## 2. Header

`ScreenHeader` is the only header. Props: `title`, `subtitle?`, `onBack?`, `action?`,
`leading?`.

- White bar (`backgroundAlt`), edge-to-edge, runs behind the status bar.
- Back on the **left**, 36×36, borderless, `arrow-back`, size 20. Action on the right.
- Title: Sora SemiBold 17 / `-0.2`. Subtitle: PJS Regular 12 muted.
- Row height 44, horizontal gutter 16, bottom padding 4. Compact — no floating island, no
  border, no shadow, no oversized title.
- Tab/root screens omit `onBack`. Home passes `leading={<AppLogo size={24} />}` and
  `title="Hibbullah"`. Product detail passes `title=""` with an `onBack`.

Do not reintroduce `SoftHeader`, `common/Header`, `AdminHeader`, floating back circles or
in-content bold titles. If a screen needs something the header cannot do, extend
`ScreenHeader` for everyone.

## 3. Gutter, rhythm, surfaces

- **Page gutter: 16 (`spacing.lg`)** on every screen, list and grid alike. Content padding
  `padding: spacing.lg` (grids) or `paddingHorizontal: spacing.lg, paddingTop: spacing.sm`.
- Section rhythm: 20–24 between sections (`spacing.xl` / `xxl`), 8–12 inside a group.
  No giant vertical gaps, no hero whitespace under the header.
- **Card**: `backgroundColor: colors.backgroundAlt`, `borderRadius: radius.lg`, **no
  border, no shadow**. Padding 16 for content cards, 12 for dense rows, 8 gap between
  sibling cards. The off-white page (`#F6F7F4`) vs white card is the separation.
- **Controls** (inputs, chips, secondary buttons, the nav island) keep a 1px hairline:
  `colors.borderLight` default, `colors.accent` when selected/focused.
- One card level deep. Never a card inside a card — use an unstyled group or hairline
  dividers (`colors.borderSoft`) inside a card.
- No shadows (`useShadows()` returns none by design), no gradients, no alpha colours.

## 4. Typography

Sora for headings and display; Plus Jakarta Sans for everything a person reads as
information. **Always set `fontFamily`; never set `fontWeight`** (weights live in the
family name — `fontFamily.pjsSemiBold`, not `fontWeight: "700"`). Never a bare `fontSize`
number: use `fontSize.*`.

| Role | Family token | Size token |
| --- | --- | --- |
| Screen title (header) | `soraSemiBold` | `body` (17) |
| Section title | `soraSemiBold` | `subhead` (15) |
| Display / big metric | `soraBold` | `title2` (22) |
| Card / product title | `pjsSemiBold` | `subhead` (15) |
| Body | `pjsRegular` | `subhead` (15) |
| Button / tab label | `pjsSemiBold` | `subhead` (15) / `tiny` (10) nav |
| Meta, timestamp, count | `pjsRegular` | `footnote` (13) |
| Caption / hint | `pjsRegular` | `caption` (12) |
| Price (emphasised) | `pjsBold` | `subhead` (15) or `body` (17) |
| Section eyebrow (admin) | `pjsSemiBold` | `micro` (11), letterspaced, lowercase-ish |

Line heights: `fontSize.x * lineHeight.normal` for body, `* lineHeight.tight` for headings.
Uppercase only for small status badges (`StatusBadge`), never for section labels or titles.

## 5. Buttons, inputs, chips

- `Button` (primary/secondary/danger/ghost/link) is the only button. Height 44, label PJS
  SemiBold 15. No local button styles in screens.
- Inputs: `Input` / `SearchBar` / `Select` / `SearchableSelect`. Text is PJS 17, height 44.
- Chips: `FilterChip` for filter rows. Selected = `primarySoft` fill + `accent` ink.
- Icon buttons: use `IconButton` or a `Pressable` with a 36×36 hit target; icon size 18–20.

## 6. States

`LoadingState`, `ErrorState`, `EmptyState` are the only async placeholders. They carry
`flex: 1` — render them as the branch's sole child or as `ListEmptyComponent`, never inside
`ListHeaderComponent`. Every data screen handles all three plus an inline error for
mutations (`actionError` text under the failing area). Empty states use a real `icon`.

## 7. Colour discipline

- Neutral page, neutral text, white cards. Green (`accent` / `primary`) appears on:
  primary buttons, links, selected chips, focus rings, active nav, icon wells.
- `colors.primary` as a **fill** is restricted to genuine primary actions (enforced by
  `verify:flat-ui`). Labels on any accent fill use `colors.textInverse` — never
  `colors.white` (dark mode's accent fill is light).
- Statuses come from `status.*` soft fills via `StatusBadge`. Gold is decorative only, never
  text.

## 8. Interaction & motion

- Press feedback on every pressable: `opacity` dip or the spring compression used by
  `Button`/`AnimatedPressable`. Hit targets ≥ 44.
- Motion is restrained: 150–250ms, `springConfigs.press` for touch, no bouncing page
  transitions, respect `useReducedMotion`.
- Full keyboard/`accessibilityRole`/`accessibilityLabel` on controls, as the existing
  components do.

## 9. Hard constraints (mechanical, enforced by `npm run verify`)

- `radius` scale is **2 / 6 / 8 only**, and no numeric `borderRadius` literal in `src/`
  (eslint `hibbullah/radius-token`). Circles: `size / 2`.
- No `rgba(...)`, no `colors.x + "22"` alpha-appended hex, no gradients.
- Page/card hexes stay `#F6F7F4`/`#FFFFFF` and `#0A0C0B`/`#131615`.
- Keep these anchor strings intact (mutation tests depend on them):
  `ConfirmDialog.tsx` → `borderRadius: radius.xl`; `Avatar.tsx` → `borderRadius: size / 2`
  and `backgroundColor: colors.border`; `checkout.tsx` → `colors.dangerSoft`;
  `(admin)/index.tsx` → `colors.borderFocus` and `colors.textInverse`;
  `ProductCard.tsx` → `import { useThemeColors } from "../../providers/ThemeProvider";`.
- Do not touch `src/services`, `src/lib`, `src/providers` data logic, SQL or Supabase
  config. Hooks may be *read*; their data contracts do not change.
- Typecheck (`npx tsc --noEmit`) and lint (`npx expo lint`) must stay clean of new errors.

## 10. Out of scope

Backend, database, routing structure, auth flow, business rules. Redesign how things look
and are composed — never what they do.
