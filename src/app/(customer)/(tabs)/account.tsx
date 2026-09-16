import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useAuth } from "../../../hooks/useAuth";
import colors from "../../../constants/colors";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";

export default function AccountScreen() {
  const router = useRouter();
  const { user, isAdmin, signOut } = useAuth();

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : "T";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.subtitle}>Your personal preferences</Text>
      </View>

      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.name || "User"}</Text>
          <Text style={styles.userEmail}>{user?.email || ""}</Text>
        </View>
      </View>

      {/* Admin Dashboard — visible only to admin users */}
      {isAdmin ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ADMIN</Text>
          <TouchableOpacity
            style={styles.optionButton}
            activeOpacity={0.7}
            onPress={() => router.push("/(admin)")}
          >
            <View style={styles.optionRow}>
              <View style={styles.optionIcon}>
                <SymbolView
                  name={{ ios: "square.grid.2x2.fill", android: "grid_view", web: "grid_view" }}
                  tintColor={colors.primary}
                  size={18}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionText}>Dashboard</Text>
                <Text style={styles.optionHint}>Manage store operations</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <TouchableOpacity
          style={styles.optionButton}
          activeOpacity={0.7}
          onPress={() => router.push("/(customer)/account/profile")}
        >
          <Text style={styles.optionText}>Profile</Text>
          <Text style={styles.optionHint}>Name and contact details</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionButton}
          activeOpacity={0.7}
          onPress={() => router.push("/(customer)/account/addresses" as any)}
        >
          <Text style={styles.optionText}>Addresses</Text>
          <Text style={styles.optionHint}>Delivery locations</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionButton}
          activeOpacity={0.7}
          onPress={() => router.push("/(customer)/(tabs)/orders" as any)}
        >
          <Text style={styles.optionText}>Orders</Text>
          <Text style={styles.optionHint}>Order history</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionButton}
          activeOpacity={0.7}
          onPress={() => router.push("/(customer)/account/notifications" as any)}
        >
          <Text style={styles.optionText}>Notifications</Text>
          <Text style={styles.optionHint}>Alerts and updates</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionButton}
          activeOpacity={0.7}
          onPress={() => router.push("/(customer)/account/settings" as any)}
        >
          <Text style={styles.optionText}>Settings</Text>
          <Text style={styles.optionHint}>App preferences</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} activeOpacity={0.7} onPress={signOut}>
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.white,
    fontSize: typography.body,
    fontWeight: "700",
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
    color: colors.text,
  },
  userEmail: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: typography.label,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  optionButton: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    justifyContent: "center",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  optionContent: { flex: 1 },
  optionText: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
    color: colors.text,
  },
  optionHint: {
    fontSize: typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.backgroundAlt,
    paddingVertical: spacing.md,
    alignItems: "center",
    minHeight: 44,
    marginTop: spacing.sm,
  },
  logoutText: {
    color: colors.danger,
    fontSize: typography.bodySmall,
    fontWeight: "700",
  },
});