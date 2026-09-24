import { StyleSheet, Text, View } from "react-native";
import Icon from "../common/Icon";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import type { IconName } from "../common/Icon";

type AdminStatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  accent?: "green" | "gold" | "neutral";
  icon?: IconName;
};

export default function AdminStatCard({
  label,
  value,
  detail,
  accent = "neutral",
  icon,
}: AdminStatCardProps) {
  const colors = useThemeColors();
  const shadows = useShadows();

  const accentColor =
    accent === "green"
      ? colors.primary
      : accent === "gold"
        ? colors.gold
        : colors.textMuted;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.backgroundAlt,
          borderColor: colors.borderLight,
          ...shadows.sm,
        },
      ]}
    >
      <View style={styles.top}>
        <View
          style={[
            styles.marker,
            accent === "green" && { backgroundColor: colors.primary },
            accent === "gold" && { backgroundColor: colors.gold },
            accent === "neutral" && { backgroundColor: colors.borderLight },
          ]}
        />
        {icon ? (
          <Icon name={icon} size={16} color={accentColor} />
        ) : null}
      </View>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      {detail ? (
        <Text style={[styles.detail, { color: colors.textMuted }]}>{detail}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "46%",
    borderRadius: sizes.borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  marker: {
    width: 20,
    height: 2,
    borderRadius: 1,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.caption2,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  value: {
    fontSize: typography.title2,
    fontWeight: "700",
    marginTop: spacing.xs,
    letterSpacing: typography.letterSpacing.tight,
  },
  detail: {
    fontSize: typography.caption1,
    marginTop: spacing.xs,
  },
});