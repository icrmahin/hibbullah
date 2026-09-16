import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";
import colors from "../../constants/colors";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

type AdminStatCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  accent?: "green" | "gold" | "neutral";
  icon?: SymbolViewProps["name"];
};

export default function AdminStatCard({
  label,
  value,
  detail,
  accent = "neutral",
  icon,
}: AdminStatCardProps) {
  const iconTint =
    accent === "green" ? colors.primary : accent === "gold" ? colors.gold : colors.textMuted;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View
          style={[
            styles.marker,
            accent === "green" && styles.greenMarker,
            accent === "gold" && styles.goldMarker,
          ]}
        />
        {icon ? (
          <SymbolView name={icon} tintColor={iconTint} size={17} />
        ) : null}
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: colors.backgroundAlt,
    borderRadius: sizes.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  marker: { width: 20, height: 2, borderRadius: 1, backgroundColor: colors.borderLight, marginBottom: spacing.sm },
  greenMarker: { backgroundColor: colors.primary },
  goldMarker: { backgroundColor: colors.gold },
  label: { color: colors.textMuted, fontSize: typography.caption2, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  value: { color: colors.text, fontSize: typography.title2, fontWeight: "700", marginTop: spacing.xs, letterSpacing: typography.letterSpacing.tight },
  detail: { color: colors.textMuted, fontSize: typography.caption1, marginTop: spacing.xs },
});
