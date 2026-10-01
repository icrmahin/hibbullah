import { StyleSheet, Text, View } from "react-native";
import Icon from "../common/Icon";
import { useThemeColors } from "../../providers/ThemeProvider";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography, { fontFamily } from "../../constants/typography";
import type { IconName } from "../common/Icon";
import { radius } from "../../constants/sizes";

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

  // Ink, not a fill: this is the colour of a glyph and a sparkline stroke.
  const accentColor =
    accent === "green"
      ? colors.accent
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
        },
      ]}
    >
      <View style={styles.top}>
        <View
          style={[
            styles.marker,
            // `success`, not `primary`. The prop is called "green" and the teal brand fill
            // is not green; this is also a key on a stat card, not something you press, so
            // the accent is not the right token for it either.
            accent === "green" && { backgroundColor: colors.success },
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
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  label: {
    fontFamily: fontFamily.pjsBold,
    fontSize: typography.caption2,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  value: {
    fontFamily: fontFamily.soraBold,
    fontSize: typography.title2,
    marginTop: spacing.xs,
    letterSpacing: typography.letterSpacing.tight,
  },
  detail: {
    fontSize: typography.caption1,
    marginTop: spacing.xs,
  },
});