import { router, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize } from "../../constants/typography";
import { useNotifications } from "../../hooks/useNotifications";
import Icon from "./Icon";
import AppLogo from "./AppLogo";
import type { IconName } from "./Icon";

const navLinks: { label: string; path: string; icon: IconName }[] = [
  { label: "Home", path: "/(customer)/(tabs)", icon: "home" },
  { label: "Cart", path: "/(customer)/(tabs)/cart", icon: "shopping-cart" },
  { label: "Favorites", path: "/(customer)/(tabs)/favorites", icon: "favorite-border" },
  { label: "Orders", path: "/(customer)/(tabs)/orders", icon: "receipt-long" },
  { label: "Settings", path: "/(customer)/(tabs)/account", icon: "settings" },
];

function getActivePath(pathname: string) {
  if (pathname.includes("/favorites")) return "/(customer)/(tabs)/favorites";
  if (pathname.includes("/cart")) return "/(customer)/(tabs)/cart";
  if (pathname.includes("/orders") || pathname.includes("/order/")) return "/(customer)/(tabs)/orders";
  if (pathname.includes("/account") || pathname.includes("/address") || pathname.includes("/settings") || pathname.includes("/notifications") || pathname.includes("/profile")) return "/(customer)/(tabs)/account";
  return "/(customer)/(tabs)";
}

export default function CustomerDesktopHeader() {
  const pathname = usePathname();
  const colors = useThemeColors();
  const shadows = useShadows();
  const { unreadCount } = useNotifications();
  const activePath = getActivePath(pathname);

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.island,
          {
            backgroundColor: colors.backgroundAlt,
            borderColor: colors.borderSoft,
            ...shadows.sm,
          },
        ]}
      >
        <Pressable style={styles.brandRow} onPress={() => router.replace("/(customer)/(tabs)" as never)}>
          <AppLogo size={30} />
          <Text style={[styles.brandName, { color: colors.text }]}>Hibbullah</Text>
        </Pressable>

        <View style={styles.navLinks}>
          {navLinks.map((item) => {
            const active = item.path === activePath;
            return (
              <Pressable
                key={item.label}
                style={({ pressed }) => [styles.navItem, active && { backgroundColor: colors.primarySoft }, pressed && { opacity: 0.7 }]}
                onPress={() => router.replace(item.path as never)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active }}
              >
                <Icon name={item.icon} size={16} color={active ? colors.primary : colors.textMuted} />
                <Text style={[styles.navLabel, { color: active ? colors.primary : colors.textMuted }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.rightSection}>
          <Pressable
            style={[styles.notificationButton, { backgroundColor: colors.background, borderColor: colors.borderSoft }]}
            onPress={() => router.push("/(customer)/account/notifications" as never)}
            accessibilityRole="button"
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          >
            <Icon name="notifications" size={18} color={colors.primary} />
            {unreadCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <Text style={[styles.badgeText, { color: colors.white }]}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  island: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginRight: spacing.xl },
  brandName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, lineHeight: fontSize.body * 1.3 },
  navLinks: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 },
  navItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, minHeight: 32 },
  navLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, lineHeight: fontSize.caption * 1.3 },
  rightSection: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  notificationButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", position: "relative" },
  badge: { position: "absolute", top: -2, right: -4, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 9, fontWeight: "700" },
});
