import { StyleSheet, View, type ViewStyle } from "react-native";
import { useResponsive } from "../../hooks/useResponsive";

type ResponsiveContainerProps = {
  children: React.ReactNode;
  /** Max width constraint (default: 1320) — only applied on desktop */
  maxWidth?: number;
  /** Horizontal padding on mobile (default: 16) */
  mobilePadding?: number;
  /** Additional style */
  style?: ViewStyle;
  /** Use sidebar-aware width (for admin) */
  sidebarAware?: boolean;
};

export default function ResponsiveContainer({
  children,
  maxWidth = 1320,
  mobilePadding = 16,
  style,
  sidebarAware = false,
}: ResponsiveContainerProps) {
  const { width, isMobile, isTablet, isDesktop, sidebarWidth } = useResponsive();

  const availableWidth = !isMobile && sidebarAware ? width - sidebarWidth : width;
  const horizontalPadding = isMobile ? mobilePadding : isTablet ? 24 : 32;
  const shouldConstrainWidth = !isMobile;
  const contentMaxWidth = shouldConstrainWidth ? Math.min(maxWidth, availableWidth - horizontalPadding * 2) : undefined;

  return (
    <View style={[styles.container, { paddingHorizontal: horizontalPadding }, style]}>
      <View style={[styles.inner, shouldConstrainWidth && { maxWidth: contentMaxWidth }]}>
        {children}
      </View>
    </View>
  );
}

/** Full-width container (no max-width) — for grids that should span the content area */
export function WideContainer({
  children,
  mobilePadding = 16,
  style,
  sidebarAware = false,
}: Omit<ResponsiveContainerProps, "maxWidth">) {
  const { width, isMobile, isTablet, isDesktop, sidebarWidth } = useResponsive();

  const availableWidth = !isMobile && sidebarAware ? width - sidebarWidth : width;
  const horizontalPadding = isMobile ? mobilePadding : isTablet ? 24 : 32;

  return (
    <View style={[styles.container, { paddingHorizontal: horizontalPadding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  inner: {
    width: "100%",
  },
});
