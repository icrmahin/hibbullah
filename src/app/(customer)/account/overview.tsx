import { router } from "expo-router";
import { goBack } from '@/utils/navigation';
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import SoftHeader from "../../../components/common/SoftHeader";
import Icon from "../../../components/common/Icon";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { radius, layout } from "../../../constants/sizes";
import { useAuth } from "../../../hooks/useAuth";

export default function CustomerAccountDashboard() {
  const colors = useThemeColors();
  const { user, signOut } = useAuth();
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : "H";

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Account" subtitle="Hibbullah · Your account" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.identityPanel, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.white }]}>{initial}</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Hibbullah · Customer</Text>
            <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>{user?.name ?? "Welcome"}</Text>
            {user?.email ? <Text style={[styles.userEmail, { color: colors.textMuted }]} numberOfLines={1}>{user.email}</Text> : null}
          </View>
        </View>
        {SECTIONS.map((section) => (
          <View key={section.index}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionIndex, { color: colors.textMuted }]}>{section.index}</Text>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
              <View style={[styles.sectionRule, { backgroundColor: colors.border }]} />
            </View>
            <View style={[styles.panel, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
              {section.items.map((item, itemIndex) => (
                <View key={item.label}>
                  <Pressable
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    android_ripple={{ color: "rgba(143, 184, 168, 0.12)" }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.label}`}
                    onPress={() => router.push(item.route as never)}
                  >
                    <View style={[styles.iconTile, { borderColor: colors.border, backgroundColor: colors.background }]}>
                      <Icon name={item.icon as any} size={18} color={colors.primary} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.rowLabel, { color: colors.text }]}>{item.label}</Text>
                      <Text style={[styles.rowMeta, { color: colors.textMuted }]}>{item.meta}</Text>
                    </View>
                    <Icon name="chevron-right" size={18} color={colors.textMuted} />
                  </Pressable>
                  {itemIndex < section.items.length - 1 ? <View style={[styles.hairline, { backgroundColor: colors.border }]} /> : null}
                </View>
              ))}
            </View>
          </View>
        ))}
        <Pressable
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
          android_ripple={{ color: "rgba(143, 184, 168, 0.12)" }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={signOut}
        >
          <Icon name="logout" size={18} color={colors.primary} />
          <Text style={[styles.signOutText, { color: colors.primary }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const SECTIONS = [
  { index: "01", title: "Account", items: [{ label: "Profile", meta: "Name and contact", route: "/(customer)/account/profile", icon: "person" }, { label: "Addresses", meta: "Delivery locations", route: "/(customer)/account/addresses", icon: "place" }] },
  { index: "02", title: "Activity", items: [{ label: "Orders", meta: "Track deliveries", route: "/(customer)/(tabs)/orders", icon: "inventory-2" }, { label: "Notifications", meta: "Updates and alerts", route: "/(customer)/account/notifications", icon: "notifications" }] },
  { index: "03", title: "Preferences", items: [{ label: "Settings", meta: "App preferences", route: "/(customer)/account/settings", icon: "settings" }] },
];

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  identityPanel: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  identityText: { flex: 1, gap: spacing.xs },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  userName: { fontSize: 14, fontWeight: "700", letterSpacing: -0.1 },
  userEmail: { fontSize: 12 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  sectionIndex: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8 },
  sectionTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.1 },
  sectionRule: { flex: 1, height: 1 },
  panel: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, minHeight: layout.touch },
  iconTile: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: spacing.xs },
  rowLabel: { fontSize: 12, fontWeight: "600" },
  rowMeta: { fontSize: 12 },
  hairline: { height: 1 },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, paddingVertical: spacing.md, minHeight: layout.touch, marginTop: spacing.sm },
  signOutText: { fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.6, transform: [{ scale: 0.99 }] },
});
