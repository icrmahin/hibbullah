import { router, usePathname } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AdminDrawer from "./AdminDrawer";
import Icon from "../common/Icon";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import type { IconName } from "../common/Icon";

const MAIN_TABS: { label: string; path: string; icon: IconName }[] = [
  { label: "Dashboard", path: "/(admin)", icon: "dashboard" },
  { label: "Orders", path: "/(admin)/orders", icon: "receipt-long" },
  { label: "Products", path: "/(admin)/products", icon: "inventory-2" },
];

function getActivePath(pathname: string): string {
  if (pathname.includes("/orders")) return "/(admin)/orders";
  if (pathname.includes("/products")) return "/(admin)/products";
  return "/(admin)";
}

export default function AdminNavigation() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const shadows = useShadows();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activePath = getActivePath(pathname);
  const isMenuActive = !["/(admin)", "/(admin)/orders", "/(admin)/products"].some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  return (
    <>
      <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.sm), backgroundColor: colors.background }]}>
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
        {MAIN_TABS.map((item) => {
          const active = item.path === activePath;
          return (
            <Pressable
              key={item.label}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.pressed,
              ]}
              onPress={() => router.replace(item.path as never)}
              android_ripple={{ color: colors.ripple.primary }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.label}`}
              accessibilityState={{ selected: active }}
            >
              <View
                style={[
                  styles.pill,
                  active && { backgroundColor: colors.primarySoft },
                ]}
              >
                <Icon
                  name={item.icon}
                  size={18}
                  color={active ? colors.primary : colors.textMuted}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  { color: active ? colors.primary : colors.textMuted },
                ]}
              >
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
            <View style={[styles.pill, isMenuActive && { backgroundColor: colors.primarySoft }]}>
              <Icon name="menu" size={18} color={isMenuActive ? colors.primary : colors.textMuted} />
            </View>
            <Text style={[styles.label, { color: isMenuActive ? colors.primary : colors.textMuted }]}>Menu</Text>
          </Pressable>
        </View>
      </View>

      <AdminDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  island: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 40,
    paddingHorizontal: 4,
  },
  pill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.1,
    lineHeight: 11,
  },
  pressed: { opacity: 0.6 },
});