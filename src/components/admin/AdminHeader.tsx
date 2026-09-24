import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

type AdminHeaderProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export default function AdminHeader({ title, subtitle, action }: AdminHeaderProps) {
  const colors = useThemeColors();
  const shadows = useShadows();

  // soft feather: minimal text, time when needed, icon+word CTA
  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.island,
          {
            backgroundColor: colors.backgroundAlt,
            borderColor: colors.borderSoft,
            ...shadows.xs,
          },
        ]}
      >
        <View style={styles.titleArea}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  island: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 52,
  },
  titleArea: { flex: 1, gap: 2 },
  title: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "500",
  },
  action: { marginLeft: spacing.sm },
});