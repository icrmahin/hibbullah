import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";
import { useTheme, useThemeColors } from "../../../providers/ThemeProvider";
import { useShadows } from "../../../constants/shadows";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { radius } from "../../../constants/sizes";
import Icon from "../../../components/common/Icon";
import Avatar from "../../../components/common/Avatar";
import ResponsiveContainer from "../../../components/common/ResponsiveContainer";
import { useResponsive } from "../../../hooks/useResponsive";
import type { IconName } from "../../../components/common/Icon";
import Toggle from "../../../components/common/Toggle";
import { formatBdPhone } from "../../../utils/phone";

type SettingsSection = {
  title: string;
  items: {
    label: string;
    icon: IconName;
    route?: string;
    destructive?: boolean;
    toggle?: boolean;
  }[];
};

// Feather-light: core settings first, low-use moved to More Options
//
// There is deliberately no "Profile Details" row here. The card at the top of
// this screen is the single profile entry — it showed name, email and avatar but
// was one of two identical doors to the same editor.
const SECTIONS: SettingsSection[] = [
  {
    title: "Account",
    items: [
      { label: "Notifications", icon: "notifications", route: "/(customer)/account/notifications" },
      { label: "Password & Security", icon: "lock", route: "/(customer)/account/security" },
    ],
  },
  {
    title: "Preferences",
    items: [{ label: "Dark Mode", icon: "dark-mode", toggle: true }],
  },
  {
    title: "More Options",
    items: [
      { label: "Help & FAQ", icon: "help-outline", route: "/(customer)/account/help" },
      { label: "Contact Us", icon: "phone", route: "/(customer)/account/contact" },
      { label: "About Hibbullah", icon: "info-outline", route: "/(customer)/account/about" },
      { label: "Terms & Privacy", icon: "description", route: "/(customer)/account/terms" },
    ],
  },
  {
    title: "App",
    items: [{ label: "Log Out", icon: "logout", destructive: true }],
  },
];

const ROW_ICON_SIZE = 28;
const ROW_CONTENT_INSET = spacing.md * 2 + ROW_ICON_SIZE;

export default function AccountScreen() {
  const router = useRouter();
  const { user, isAdmin, signOut } = useAuth();
  const colors = useThemeColors();
  const shadows = useShadows();
  const { themeMode, setThemeMode } = useTheme();
  const { isDesktop } = useResponsive();

  const isDark = themeMode === "dark" || (themeMode === "system" && colors.background === "#111A17");
  const statusText = isAdmin ? "Admin • Verified" : "Member • Active";
  const displayPhone = formatBdPhone(user?.phone);

  const handleItemPress = (item: SettingsSection["items"][0]) => {
    if (item.destructive) {
      signOut();
      return;
    }
    if (item.route) {
      router.push(item.route as never);
    }
  };

  const handleDarkModeToggle = () => {
    setThemeMode(isDark ? "light" : "dark");
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <ResponsiveContainer
        maxWidth={isDesktop ? 800 : 1320}
        style={styles.responsiveContainer}
      >
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Soft • feather-light • {isAdmin ? "admin" : "customer"}</Text>

        {/* The single profile entry: tap the card to open the editor. */}
        <Pressable
          style={({ pressed }) => [
            styles.profileCard,
            { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.sm },
            pressed && styles.pressed,
          ]}
          onPress={() => router.push("/(customer)/account/profile")}
          accessibilityRole="button"
          accessibilityLabel="Edit your profile"
        >
          <View style={styles.avatar}>
            <Avatar uri={user?.avatar} name={user?.name} size={44} priority="high" />
            <View style={[styles.avatarStatus, { backgroundColor: colors.success, borderColor: colors.backgroundAlt }]} />
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
                {user?.name || "User"}
              </Text>
              <View style={[styles.statusChip, { backgroundColor: colors.successSoft, borderColor: colors.successBorder }]}>
                <Text style={[styles.statusChipText, { color: colors.success }]}>{statusText}</Text>
              </View>
            </View>
            <Text style={[styles.profileEmail, { color: colors.textMuted }]} numberOfLines={1}>
              {user?.email || ""}
            </Text>
            {displayPhone ? (
              <Text style={[styles.profileEmail, { color: colors.textMuted }]} numberOfLines={1}>
                {displayPhone}
              </Text>
            ) : null}
          </View>
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>

        {/* Admin Dashboard — stays in Settings as main dashboard */}
        {isAdmin ? (
          <Pressable
            style={({ pressed }) => [
              styles.adminCard,
              { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.sm },
              pressed && styles.pressed,
            ]}
            onPress={() => router.push("/(admin)")}
            accessibilityRole="button"
            accessibilityLabel="Open admin dashboard"
          >
            <View style={[styles.adminIconContainer, { backgroundColor: colors.primarySoft }]}>
              <Icon name="dashboard" size={18} color={colors.primary} />
            </View>
            <View style={styles.adminInfo}>
              <Text style={[styles.adminLabel, { color: colors.text }]}>Admin Dashboard</Text>
              <Text style={[styles.adminHint, { color: colors.textMuted }]}>Products • Orders • Inventory — main cockpit</Text>
            </View>
            <View style={[styles.adminArrow, { backgroundColor: colors.background, borderColor: colors.borderSoft }]}>
              <Icon name="arrow-forward" size={16} color={colors.primary} />
            </View>
          </Pressable>
        ) : null}

        {/* Settings Sections — feather light */}
        <View style={[styles.sectionsGrid, isDesktop && styles.sectionsGridDesktop]}>
          {SECTIONS.map((section) => (
            <View key={section.title} style={[styles.section, isDesktop && styles.sectionDesktop]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
              <View style={[styles.sectionGroup, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
                {section.items.map((item, index) => (
                  <View key={item.label}>
                    <Pressable
                      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                      onPress={() => {
                        if (item.toggle) {
                          handleDarkModeToggle();
                        } else {
                          handleItemPress(item);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: item.destructive ? colors.redSoft : colors.primarySoft }]}>
                        <Icon name={item.icon} size={18} color={item.destructive ? colors.danger : colors.primary} />
                      </View>
                      <Text style={[styles.rowLabel, { color: item.destructive ? colors.danger : colors.text }]}>{item.label}</Text>
                      {item.toggle ? (
                        <Toggle value={isDark} onValueChange={handleDarkModeToggle} size="sm" />
                      ) : (
                        <Icon name="chevron-right" size={16} color={colors.textMuted} />
                      )}
                    </Pressable>
                    {index < section.items.length - 1 ? (
                      <View style={[styles.divider, { backgroundColor: colors.borderSoft, marginLeft: ROW_CONTENT_INSET }]} />
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ResponsiveContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xs,
  },
  responsiveContainer: {
    alignItems: "center",
  },
  title: {
    fontSize: typography.title2,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: typography.caption,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    position: "relative",
  },
  avatarStatus: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  avatarText: { fontSize: typography.body, fontWeight: "700" },
  profileInfo: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  profileName: { fontSize: typography.bodySmall, fontWeight: "700" },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  profileEmail: { fontSize: typography.caption },
  adminCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  adminIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  adminInfo: { flex: 1 },
  adminLabel: { fontSize: typography.bodySmall, fontWeight: "700" },
  adminHint: { fontSize: typography.caption, marginTop: 2 },
  adminArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionsGrid: {},
  sectionsGridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  section: { marginBottom: spacing.lg },
  sectionDesktop: {
    flexBasis: "48%",
    flexGrow: 1,
    flexShrink: 1,
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionGroup: {
    borderWidth: 1,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  rowIcon: {
    width: ROW_ICON_SIZE,
    height: ROW_ICON_SIZE,
    borderRadius: ROW_ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: typography.bodySmall, fontWeight: "600" },
  divider: { height: 1 },
  pressed: { opacity: 0.6, transform: [{ scale: 0.99 }] },
});
