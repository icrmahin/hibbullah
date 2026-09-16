import { router, usePathname } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AdminDrawer from "./AdminDrawer";
import colors from "../../constants/colors";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

type IconName = SymbolViewProps["name"];

const MAIN_TABS: {
  label: string;
  path: string;
  icon: IconName;
}[] = [
  { label: "Dashboard", path: "/(admin)", icon: { ios: "square.grid.2x2.fill", android: "grid_view", web: "grid_view" } },
  { label: "Orders", path: "/(admin)/orders", icon: { ios: "shippingbox.fill", android: "inventory_2", web: "inventory_2" } },
  { label: "Products", path: "/(admin)/products", icon: { ios: "pills.fill", android: "medication", web: "medication" } },
];

function getActivePath(pathname: string): string {
  if (pathname.includes("/orders")) return "/(admin)/orders";
  if (pathname.includes("/products")) return "/(admin)/products";
  return "/(admin)";
}

export default function AdminNavigation() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activePath = getActivePath(pathname);
  const isMenuActive = !["/(admin)", "/(admin)/orders", "/(admin)/products"].some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  return (
    <>
      <View
        style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      >
        {MAIN_TABS.map((item) => {
          const active = item.path === activePath;
          return (
            <Pressable
              key={item.label}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              onPress={() => router.replace(item.path as never)}
              android_ripple={{ color: colors.ripple.primary }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.label}`}
              accessibilityState={{ selected: active }}
            >
              {active ? <View style={styles.activeBar} /> : null}
              <SymbolView
                name={item.icon}
                tintColor={active ? colors.primary : colors.textMuted}
                size={20}
              />
              <Text style={[styles.label, active && styles.activeLabel]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          onPress={() => setDrawerOpen(true)}
          android_ripple={{ color: colors.ripple.primary }}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          accessibilityState={{ selected: isMenuActive }}
        >
          {isMenuActive ? <View style={styles.activeBar} /> : null}
          <SymbolView
            name={{ ios: "line.3.horizontal", android: "menu", web: "menu" }}
            tintColor={isMenuActive ? colors.primary : colors.textMuted}
            size={20}
          />
          <Text style={[styles.label, isMenuActive && styles.activeLabel]}>
            Menu
          </Text>
        </Pressable>
      </View>

      <AdminDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.backgroundAlt,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
  },
  item: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    position: "relative",
    paddingTop: spacing.sm,
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
    fontSize: typography.caption2,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  activeLabel: { color: colors.primary },
  pressed: { opacity: 0.7 },
});
