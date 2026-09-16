import { useWindowDimensions } from "react-native";

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

const BREAKPOINTS = {
  xs: 0,
  sm: 375,
  md: 576,
  lg: 768,
  xl: 1024,
  xxl: 1280,
} as const;

const COLUMNS = {
  xs: 1,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  xxl: 5,
} as const;

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

  const columns = COLUMNS[breakpoint];
  const sidebarWidth = isDesktop ? (SIDEBAR_WIDTH as Record<string, number>)[breakpoint] ?? 260 : 0;

  const contentWidth = isDesktop ? width - sidebarWidth : width;
  const cardWidth = contentWidth / columns - (spacing.lg * (columns - 1)) / columns;

  return {
    width,
    height,
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    columns,
    sidebarWidth,
    contentWidth,
    cardWidth,
  };
}

const spacing = { lg: 16 };

export default useResponsive;
