import { router, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize } from "../../constants/typography";
import sizes from "../../constants/sizes";
import Icon from "../common/Icon";
import AppLogo from "../common/AppLogo";
import type { IconName } from "../common/Icon";

type NavItem = {
  label: string;
  path: string;
  icon: IconName;
  section?: string;
};

const MAIN_NAV: NavItem[] = [
  { label: "Dashboard", path: "/(admin)", icon: "dashboard" },
  { label: "Orders", path: "/(admin)/orders", icon: "receipt-long" },
  { label: "Products", path: "/(admin)/products", icon: "inventory-2" },
];

const SECONDARY_NAV: NavItem[] = [
  { label: "Inventory", path: "/(admin)/inventory", icon: "inventory" },
  { label: "Customers", path: "/(admin)/customers", icon: "people" },
  { label: "Reports", path: "/(admin)/reports", icon: "bar-chart" },
  { label: "Returns", path: "/(admin)/returns", icon: "assignment-return" },
  { label: "Audit Log", path: "/(admin)/audit", icon: "description" },
];

const SHOP_LINK = { label: "Back to Shop", path: "/(customer)/(tabs)" as const, icon: "store" as IconName };

function getActivePath(pathname: string): string {
  if (pathname.includes("/orders")) return "/(admin)/orders";
  if (pathname.includes("/products")) return "/(admin)/products";
  if (pathname.includes("/inventory")) return "/(admin)/inventory";
  if (pathname.includes("/customers")) return "/(admin)/customers";
  if (pathname.includes("/reports")) return "/(admin)/reports";
  if (pathname.includes("/returns")) return "/(admin)/returns";
  if (pathname.includes("/audit")) return "/(admin)/audit";
  return "/(admin)";
}

function SidebarItem({
  item,
  active,
  colors,
}: {
  item: NavItem;
  active: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.navItem,
        active && { backgroundColor: colors.primarySoft },
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => router.replace(item.path as never)}
      android_ripple={{ color: colors.ripple.primary }}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.iconTile, active && { backgroundColor: colors.primarySoft }]}>
        <Icon name={item.icon} size={18} color={active ? colors.primary : colors.textMuted} />
      </View>
      <Text
        style={[styles.navLabel, { color: active ? colors.primary : colors.textMuted }]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const colors = useThemeColors();
  const shadows = useShadows();
  const activePath = getActivePath(pathname);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.backgroundAlt,
          borderRightColor: colors.borderLight,
          ...shadows.sm,
        },
      ]}
    >
      {/* Logo */}
      <View style={[styles.logoSection, { borderBottomColor: colors.borderLight }]}>
        <AppLogo size={28} />
        <View style={styles.logoTextGroup}>
          <Text style={[styles.logoName, { color: colors.text }]}>Hibbullah</Text>
          <Text style={[styles.logoSub, { color: colors.textMuted }]}>Admin</Text>
        </View>
      </View>

      {/* Main nav */}
      <View style={styles.navSection}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Main</Text>
        {MAIN_NAV.map((item) => (
          <SidebarItem key={item.path} item={item} active={item.path === activePath} colors={colors} />
        ))}
      </View>

      {/* Secondary nav */}
      <View style={styles.navSection}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Management</Text>
        {SECONDARY_NAV.map((item) => (
          <SidebarItem key={item.path} item={item} active={item.path === activePath} colors={colors} />
        ))}
      </View>

      {/* Back to shop */}
      <View style={[styles.bottomSection, { borderTopColor: colors.borderLight }]}>
        <SidebarItem
          item={SHOP_LINK}
          active={false}
          colors={colors}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 260,
    borderRightWidth: 1,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  logoSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  logoTextGroup: {
    flex: 1,
  },
  logoName: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.3,
  },
  logoSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.tiny,
    lineHeight: fontSize.tiny * 1.3,
    marginTop: 1,
  },
  navSection: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    lineHeight: 9 * 1.3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: sizes.borderRadius.md,
    minHeight: 40,
    marginBottom: 2,
  },
  iconTile: {
    width: 30,
    height: 30,
    borderRadius: sizes.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * 1.3,
  },
  bottomSection: {
    marginTop: "auto",
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
  },
});
