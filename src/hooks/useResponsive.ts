import { useWindowDimensions } from "react-native";
import { spacing } from "../constants/spacing";

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

const BREAKPOINTS = {
  xs: 0,
  sm: 375,
  md: 576,
  lg: 768,
  xl: 1024,
  xxl: 1280,
} as const;

/**
 * Product cards per row, by breakpoint. Two on every phone width.
 *
 * These were `xs: 1, sm: 1`, and five screens each worked around that with their own copy
 * of `isMobile ? 1 : isTablet ? 2 : columns`. Five copies of one policy is five places
 * for the policy to disagree with itself, and they did: two capped the result at three,
 * three did not, the product grid and the search grid disagreed about tablet, and home
 * and favourites ignored the hook altogether and divided the screen width by two
 * themselves. The rule is "two cards on a phone, more as the screen grows", and it now
 * has exactly one statement.
 *
 * `md` is 576px, the first tablet width. Three cards fit there at about 173px each, which
 * is the width a single-column card was already being squeezed to on a phone.
 */
const PRODUCT_COLUMNS = {
  xs: 2,
  sm: 2,
  md: 3,
  lg: 3,
  xl: 4,
  xxl: 5,
} as const;

/**
 * Order, customer and audit *rows* per breakpoint. Not the same as the product grid, and
 * this is the one place a single `columns` would have been the wrong abstraction.
 *
 * A product card is a thumbnail, a name and a price, and two of those fit a 375px screen
 * without complaint. An order row is a status, a date, an item count and a total, and at
 * 170px wide it wraps into a shape nobody can read — which is why these screens have
 * always been one-up on a phone, and why forcing them to match the product grid would have
 * made them worse. Above the phone they grow, capped at three so a desktop row does not
 * stretch into a ribbon.
 */
const LIST_COLUMNS = {
  xs: 1,
  sm: 1,
  md: 2,
  lg: 2,
  xl: 3,
  xxl: 3,
} as const;

/**
 * The gutter the product grids are drawn on: `spacing.lg` of page padding either side and
 * `spacing.md` between cards. Home and favourites both hard-coded this arithmetic — the
 * same expression, twice, in two files — so a change to the page gutter had to be made
 * twice or not at all.
 */
const GRID = { padding: spacing.lg, gap: spacing.md } as const;

const SIDEBAR_WIDTH = {
  lg: 260,
  xl: 280,
  xxl: 300,
} as const;

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const breakpoint: Breakpoint =
    width >= BREAKPOINTS.xxl
      ? "xxl"
      : width >= BREAKPOINTS.xl
        ? "xl"
        : width >= BREAKPOINTS.lg
          ? "lg"
          : width >= BREAKPOINTS.md
            ? "md"
            : width >= BREAKPOINTS.sm
              ? "sm"
              : "xs";

  const isMobile = width < BREAKPOINTS.md;
  const isTablet = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg;
  const isDesktop = width >= BREAKPOINTS.lg;
  const isWide = width >= BREAKPOINTS.xl;

  const columns = PRODUCT_COLUMNS[breakpoint];
  const listColumns = LIST_COLUMNS[breakpoint];
  const sidebarWidth = isDesktop ? (SIDEBAR_WIDTH as Record<string, number>)[breakpoint] ?? 260 : 0;

  /**
   * The width of one card in a `flexWrap` grid.
   *
   * This is a *screen* measurement, not a *content-area* one, and the distinction was the
   * bug in the version it replaces. That one subtracted `sidebarWidth` — which is 260 at
   * `lg` — from the total, and so reported a 508px content area for a customer screen at
   * 768px that has no sidebar at all. Nothing called it, which is how a wrong number gets
   * to sit in a hook unchallenged for as long as it liked.
   */
  const cardWidth = (width - GRID.padding * 2 - GRID.gap * (columns - 1)) / columns;

  return {
    width,
    height,
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    /** Product cards per row. Two on every phone. */
    columns,
    /** Order/customer rows per row. One on a phone, up to three on a desktop. */
    listColumns,
    sidebarWidth,
    cardWidth,
  };
}

export default useResponsive;
