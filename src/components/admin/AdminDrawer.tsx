import { router } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../common/Icon";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import type { IconName } from "../common/Icon";

const MENU_ITEMS: { label: string; path: string; icon: IconName }[] = [
  { label: "Inventory", path: "/(admin)/inventory", icon: "inventory" },
  { label: "Customers", path: "/(admin)/customers", icon: "people" },
  { label: "Reports", path: "/(admin)/reports", icon: "bar-chart" },
  { label: "Returns", path: "/(admin)/returns", icon: "assignment-return" },
  { label: "Audit log", path: "/(admin)/audit", icon: "description" },
];

const SHOP_ITEM = { label: "Back to Shop", path: "/(customer)/(tabs)" as const, icon: "store" as IconName };

export default function AdminDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const insets = useSafeAreaInsets();

  const navigate = (path: string) => {
    onClose();
    router.push(path as never);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        <Pressable style={[styles.backdrop, { backgroundColor: "rgba(17,26,23,0.22)" }]} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.backgroundAlt,
              borderColor: colors.borderSoft,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              ...shadows.sm,
            },
          ]}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.borderSoft }]}>
            <View>
              <Text style={[styles.sheetEyebrow, { color: colors.textMuted }]}>Hibbullah</Text>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Menu</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.background, borderColor: colors.borderSoft }]}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            >
              <Icon name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.section}>
            {MENU_ITEMS.map((item) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.primarySoft }]}
                onPress={() => navigate(item.path)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.label}`}
              >
                <View style={[styles.iconTile, { backgroundColor: colors.background, borderColor: colors.borderSoft }]}>
                  <Icon name={item.icon} size={16} color={colors.primary} />
                </View>
                <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
                <Icon name="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} />

          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.background }]}
            onPress={() => navigate(SHOP_ITEM.path)}
            accessibilityRole="button"
            accessibilityLabel="Back to shop"
          >
            <View style={[styles.iconTile, { backgroundColor: colors.successSoft, borderColor: colors.successBorder }]}>
              <Icon name={SHOP_ITEM.icon} size={16} color={colors.success} />
            </View>
            <Text style={[styles.menuLabel, { color: colors.success }]}>{SHOP_ITEM.label}</Text>
            <Icon name="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    margin: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingTop: spacing.md,
    // soft feather, not xl hard shadow
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  sheetEyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" },
  sheetTitle: { fontSize: typography.title3, fontWeight: "700", marginTop: 2 },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, gap: 2 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    minHeight: 44,
  },
  iconTile: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 13, fontWeight: "600" },
  divider: { height: 1, marginHorizontal: spacing.md, marginVertical: spacing.sm },
});
