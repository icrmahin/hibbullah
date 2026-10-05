import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";
import { useTheme, useThemeColors } from "../../../providers/ThemeProvider";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, letterSpacing, lineHeight } from "../../../constants/typography";
import { radius } from "../../../constants/sizes";
import Icon from "../../../components/common/Icon";
import StatusBadge from "../../../components/common/StatusBadge";
import Avatar from "../../../components/common/Avatar";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import { useResponsive } from "../../../hooks/useResponsive";
import { useBottomInset } from "../../../hooks/useBottomInset";
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
/** Circles in the admin block: radius is derived from these sizes, not the 2/6/8 scale. */
const ADMIN_ICON_SIZE = 36;
const ADMIN_ARROW_SIZE = 28;

export default function AccountScreen() {
  const router = useRouter();
  const { user, isAdmin, signOut } = useAuth();
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { resolvedTheme, setThemeMode } = useTheme();
  const { isDesktop } = useResponsive();

  // Optimistic switch: flipping the theme re-renders every themed component in the
  // app in one commit, which stalls the JS thread on a slow phone — and because the
  // Switch is controlled, its own thumb waits for that same commit, so the switch
  // itself looks frozen. The switch answers from local state on this frame; the
  // global commit is deferred a frame so it lands after the thumb has started moving.
  // `pendingDark` only wins while it disagrees with the context — the moment the
  // deferred commit lands, the context is the answer again, with no extra render.
  const [pendingDark, setPendingDark] = useState<boolean | null>(null);
  const resolvedDark = resolvedTheme === "dark";
  const isDark = pendingDark !== null && pendingDark !== resolvedDark ? pendingDark : resolvedDark;

  // Was: `themeMode === "dark" || (themeMode === "system" && colors.background === "#111A17")`
  //
  // That inferred the resolved theme by comparing a *colour value* to a hard-coded hex,
  // which is fragile in a way that hides itself: the check stays false for every value
  // except the one it was written against, so changing the dark background silently turns
  // it off with no error anywhere. `resolvedTheme` is what this was reimplementing, badly,
  // and `useTheme` already computes it from the system scheme.
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

  const handleDarkModeToggle = (next: boolean) => {
    setPendingDark(next);
    requestAnimationFrame(() => {
      setThemeMode(next ? "dark" : "light");
    });
  };

  return (
    <Screen header={<ScreenHeader title="Settings" />}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        {/* The single profile entry: tap the card to open the editor. */}
        <Pressable
          style={[
            styles.profileCard,
            { backgroundColor: colors.backgroundAlt },
          ]}
          onPress={() => router.push("/(customer)/account/profile")}
          android_ripple={{ color: colors.ripple.primary, borderless: false }}
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
              <StatusBadge label={statusText} tone="success" />
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
            style={[
              styles.adminCard,
              { backgroundColor: colors.backgroundAlt },
            ]}
            onPress={() => router.push("/(admin)")}
            android_ripple={{ color: colors.ripple.primary, borderless: false }}
            accessibilityRole="button"
            accessibilityLabel="Open admin dashboard"
          >
            <View style={[styles.adminIconContainer, { backgroundColor: colors.primarySoft }]}>
              <Icon name="dashboard" size={18} color={colors.accent} />
            </View>
            <View style={styles.adminInfo}>
              <Text style={[styles.adminLabel, { color: colors.text }]}>Admin Dashboard</Text>
              <Text style={[styles.adminHint, { color: colors.textMuted }]}>Products • Orders • Inventory — main cockpit</Text>
            </View>
            <View style={[styles.adminArrow, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
              <Icon name="arrow-forward" size={16} color={colors.accent} />
            </View>
          </Pressable>
        ) : null}

        {/* Settings Sections — feather light */}
        <View style={[styles.sectionsGrid, isDesktop && styles.sectionsGridDesktop]}>
          {SECTIONS.map((section) => (
            <View key={section.title} style={[styles.section, isDesktop && styles.sectionDesktop]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
              <View style={[styles.sectionGroup, { backgroundColor: colors.backgroundAlt }]}>
                {section.items.map((item, index) => (
                  <View key={item.label}>
                    <Pressable
                      style={styles.row}
                      android_ripple={{ color: colors.ripple.primary, borderless: false }}
                      onPress={() => {
                        if (item.toggle) {
                          handleDarkModeToggle(!isDark);
                        } else {
                          handleItemPress(item);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: item.destructive ? colors.redSoft : colors.primarySoft }]}>
                        <Icon name={item.icon} size={18} color={item.destructive ? colors.danger : colors.accent} />
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.xs,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    overflow: "hidden",
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
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  profileInfo: { flex: 1, gap: spacing.xxs },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  profileName: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  profileEmail: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  adminCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  adminIconContainer: {
    width: ADMIN_ICON_SIZE,
    height: ADMIN_ICON_SIZE,
    borderRadius: ADMIN_ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  adminInfo: { flex: 1 },
  adminLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  adminHint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.xxs,
  },
  adminArrow: {
    width: ADMIN_ARROW_SIZE,
    height: ADMIN_ARROW_SIZE,
    borderRadius: ADMIN_ARROW_SIZE / 2,
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
  // Section eyebrow, not a title: small, quiet, letterspaced — and never uppercased,
  // which is reserved for status badges.
  sectionTitle: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
    letterSpacing: letterSpacing.wide,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionGroup: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    overflow: "hidden",
  },
  rowIcon: {
    width: ROW_ICON_SIZE,
    height: ROW_ICON_SIZE,
    borderRadius: ROW_ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  divider: { height: 1 },
});
