import { router, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize } from "../../constants/typography";
import { useCart } from "../../providers/CartProvider";
import Icon from "./Icon";
import CountBadge from "./CountBadge";
import type { IconName } from "./Icon";

const navigationItems: {
  label: string;
  path: string;
  icon: IconName;
  activeIcon: IconName;
  badge?: boolean;
}[] = [
  { label: "Home", path: "/(customer)/(tabs)", icon: "home", activeIcon: "home" },
  { label: "Cart", path: "/(customer)/(tabs)/cart", icon: "shopping-cart", activeIcon: "shopping-cart", badge: true },
  { label: "Favorites", path: "/(customer)/(tabs)/favorites", icon: "favorite-border", activeIcon: "favorite" },
  { label: "Orders", path: "/(customer)/(tabs)/orders", icon: "receipt-long", activeIcon: "receipt-long" },
  { label: "Settings", path: "/(customer)/(tabs)/account", icon: "settings", activeIcon: "settings" },
] as const;

function getActivePath(pathname: string) {
  if (pathname.includes("/favorites")) return "/(customer)/(tabs)/favorites";
  if (pathname.includes("/cart")) return "/(customer)/(tabs)/cart";
  if (pathname.includes("/orders") || pathname.includes("/order/")) return "/(customer)/(tabs)/orders";
  if (pathname.includes("/products") || pathname.includes("/product/")) return "/(customer)/(tabs)/favorites";
  if (pathname.includes("/account") || pathname.includes("/address") || pathname.includes("/settings") || pathname.includes("/notifications") || pathname.includes("/profile")) return "/(customer)/(tabs)/account";
  return "/(customer)/(tabs)";
}

export default function CustomerNavigation() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { distinctCount } = useCart();
  const activePath = getActivePath(pathname);

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.sm), backgroundColor: colors.background }]}>
      <View
        style={[
          styles.island,
          {
            backgroundColor: colors.backgroundAlt,
            borderColor: colors.borderSoft,
          },
        ]}
      >
        {navigationItems.map((item) => {
          const active = item.path === activePath;
          return (
            <Pressable
              key={item.label}
              style={styles.item}
              onPress={() => router.replace(item.path as never)}
              android_ripple={{ color: colors.ripple.primary }}
              accessibilityRole="button"
              accessibilityLabel={
                item.badge && distinctCount > 0 ? `${item.label}, ${distinctCount} items in cart` : item.label
              }
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.iconContainer, active && { backgroundColor: colors.primarySoft }]}>
                <Icon name={active ? item.activeIcon : item.icon} size={20} color={active ? colors.accent : colors.textMuted} />
                {item.badge ? <CountBadge count={distinctCount} /> : null}
              </View>
              <Text style={[styles.label, { color: active ? colors.accent : colors.textMuted }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    // transparent background lets island float
  },
  island: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius.xl, // 20 feather island
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 44,
    paddingHorizontal: 2,
    overflow: "hidden",
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  label: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.tiny,
    letterSpacing: 0.2,
    lineHeight: 11,
  },
});
