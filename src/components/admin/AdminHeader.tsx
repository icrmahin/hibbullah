import React from "react";
import { StyleSheet, Text, View } from "react-native";
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
      <View style={styles.titleArea}>
        <Text style={styles.eyebrow}>Hibbullah · Admin</Text>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  titleArea: { flex: 1 },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.caption2,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: typography.title2,
    fontWeight: "700",
    letterSpacing: typography.letterSpacing.tight,
    marginTop: spacing.xxs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.caption1,
    marginTop: spacing.xxs,
  },
});
