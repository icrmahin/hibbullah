import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import colors from "../../constants/colors";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

type IconName = SymbolViewProps["name"];

const MENU_ITEMS: {
  label: string;
  path: string;
  icon: IconName;
}[] = [
  { label: "Inventory", path: "/(admin)/inventory", icon: { ios: "archivebox.fill", android: "inventory", web: "inventory" } },
  { label: "Customers", path: "/(admin)/customers", icon: { ios: "person.2.fill", android: "people", web: "people" } },
  { label: "Reports", path: "/(admin)/reports", icon: { ios: "chart.bar.fill", android: "bar_chart", web: "bar_chart" } },
  { label: "Returns", path: "/(admin)/returns", icon: { ios: "arrow.uturn.backward", android: "assignment_return", web: "assignment_return" } },
  { label: "Audit log", path: "/(admin)/audit", icon: { ios: "doc.text.fill", android: "description", web: "description" } },
];

const SHOP_ITEM = {
  label: "Back to Shop",
  path: "/(customer)/(tabs)" as const,
  icon: { ios: "storefront.fill", android: "store", web: "store" } as IconName,
};

export default function AdminDrawer({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const navigate = (path: string) => {
    onClose();
    router.push(path as never);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Menu</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            >
              <SymbolView
                name={{ ios: "xmark", android: "close", web: "close" }}
                tintColor={colors.textMuted}
                size={18}
              />
            </Pressable>
          </View>

          <View style={styles.section}>
            {MENU_ITEMS.map((item) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                onPress={() => navigate(item.path)}
                android_ripple={{ color: colors.ripple.primary }}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.label}`}
              >
                <View style={styles.iconTile}>
                  <SymbolView name={item.icon} tintColor={colors.primary} size={18} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <SymbolView
                  name={{ ios: "chevron.right", android: "chevron_right", web: "chevron_right" }}
                  tintColor={colors.textMuted}
                  size={14}
                />
              </Pressable>
            ))}
          </View>

          <View style={styles.divider} />

          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={() => navigate(SHOP_ITEM.path)}
            android_ripple={{ color: colors.ripple.primary }}
            accessibilityRole="button"
            accessibilityLabel="Back to shop"
          >
            <View style={styles.iconTile}>
              <SymbolView name={SHOP_ITEM.icon} tintColor={colors.success} size={18} />
            </View>
            <Text style={[styles.menuLabel, { color: colors.success }]}>{SHOP_ITEM.label}</Text>
            <SymbolView
              name={{ ios: "chevron.right", android: "chevron_right", web: "chevron_right" }}
              tintColor={colors.textMuted}
              size={14}
            />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  drawer: {
    backgroundColor: colors.backgroundAlt,
    borderTopLeftRadius: sizes.borderRadius.xl,
    borderTopRightRadius: sizes.borderRadius.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  drawerTitle: {
    color: colors.text,
    fontSize: typography.title3,
    fontWeight: "700",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: sizes.borderRadius.md,
    minHeight: 48,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: sizes.borderRadius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    flex: 1,
    color: colors.text,
    fontSize: typography.subhead,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
  },
  pressed: { opacity: 0.7, backgroundColor: colors.background },
});
