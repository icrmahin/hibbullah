import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import colors from "../../constants/colors";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

type AdminHeaderProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export default function AdminHeader({ title, subtitle, action }: AdminHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        style={({ pressed }) => [styles.shopButton, pressed && styles.pressed]}
        onPress={() => router.replace("/(customer)/(tabs)")}
        android_ripple={{ color: "rgba(2, 55, 25, 0.08)" }}
        accessibilityRole="button"
        accessibilityLabel="Back to shop"
      >
        <SymbolView
          name={{ ios: "storefront.fill", android: "store", web: "store" }}
          tintColor={colors.primary}
          size={16}
        />
        <Text style={styles.shopLabel}>Shop</Text>
      </Pressable>

      <View style={styles.titleArea}>
        <Text style={styles.eyebrow}>Hibbullah · Admin</Text>
        <View style={styles.titleRow}>
          <View style={styles.activeDot} />
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {action ? <View>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  shopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minHeight: 32,
  },
  shopLabel: {
    color: colors.primary,
    fontSize: typography.label,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  pressed: { opacity: 0.7 },
  titleArea: { flex: 1 },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.caption,
    marginTop: 2,
  },
});
