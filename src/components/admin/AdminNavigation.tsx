import { router, usePathname } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "../../constants/colors";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

type IconName = SymbolViewProps["name"];

const SHOP_ITEM = {
  label: "Shop",
  path: "/(customer)/(tabs)" as const,
  icon: {
    ios: "storefront.fill",
    android: "store",
    web: "store",
  } as IconName,
};

const ADMIN_SECTIONS: {
  label: string;
  path: string;
  icon: IconName;
}[] = [
  { label: "Dashboard", path: "/(admin)", icon: { ios: "square.grid.2x2.fill", android: "grid_view", web: "grid_view" } },
  { label: "Orders", path: "/(admin)/orders", icon: { ios: "shippingbox.fill", android: "inventory_2", web: "inventory_2" } },
  { label: "Products", path: "/(admin)/products", icon: { ios: "pills.fill", android: "medication", web: "medication" } },
  { label: "Inventory", path: "/(admin)/inventory", icon: { ios: "archivebox.fill", android: "inventory", web: "inventory" } },
  { label: "Customers", path: "/(admin)/customers", icon: { ios: "person.2.fill", android: "people", web: "people" } },
  { label: "Reports", path: "/(admin)/reports", icon: { ios: "chart.bar.fill", android: "bar_chart", web: "bar_chart" } },
  { label: "Returns", path: "/(admin)/returns", icon: { ios: "arrow.uturn.backward", android: "assignment_return", web: "assignment_return" } },
];

function getActivePath(pathname: string): string {
  if (pathname.includes("/orders")) return "/(admin)/orders";
  if (pathname.includes("/products")) return "/(admin)/products";
  if (pathname.includes("/inventory")) return "/(admin)/inventory";
  if (pathname.includes("/customers")) return "/(admin)/customers";
  if (pathname.includes("/reports")) return "/(admin)/reports";
  if (pathname.includes("/returns")) return "/(admin)/returns";
  return "/(admin)";
}

function NavTab({
  label,
  icon,
  active,
  onPress,
  variant = "admin",
}: {
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
  variant?: "admin" | "shop";
}) {
  const tint = variant === "shop"
    ? (active ? colors.primary : colors.success)
    : (active ? colors.primary : colors.textMuted);

  return (
    <Pressable
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
      onPress={onPress}
      android_ripple={{ color: "rgba(2, 55, 25, 0.06)" }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${label}`}
      accessibilityState={{ selected: active }}
    >
      {active ? <View style={styles.activeBar} /> : null}
      <SymbolView name={icon} tintColor={tint} size={20} />
      <Text style={[styles.label, active && styles.activeLabel, variant === "shop" && styles.shopLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AdminNavigation() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const activePath = getActivePath(pathname);

  return (
    <View
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <NavTab
          label={SHOP_ITEM.label}
          icon={SHOP_ITEM.icon}
          active={false}
          variant="shop"
          onPress={() => router.replace(SHOP_ITEM.path)}
        />
        {ADMIN_SECTIONS.map((item) => (
          <NavTab
            key={item.label}
            label={item.label}
            icon={item.icon}
            active={item.path === activePath}
            onPress={() => router.replace(item.path as never)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundAlt,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: spacing.sm,
  },
  item: {
    width: 64,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    position: "relative",
    paddingTop: 6,
  },
  activeBar: {
    position: "absolute",
    top: 0,
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  activeLabel: { color: colors.primary },
  shopLabel: { color: colors.success },
  pressed: { opacity: 0.7 },
});
