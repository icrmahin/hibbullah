import { Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Visual variant. Default: "filter" */
  variant?: "filter" | "assist" | "input";
  /** Optional leading icon */
  icon?: React.ReactNode;
  /** Show remove "x" button */
  onRemove?: () => void;
};

export default function Chip({
  label,
  selected = false,
  onPress,
  variant = "filter",
  icon,
  onRemove,
}: ChipProps) {
  const colors = useThemeColors();
  const isFilter = variant === "filter";

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        isFilter && styles.filter,
        {
          backgroundColor: selected ? colors.primarySoft : colors.backgroundAlt,
          borderColor: selected ? colors.primary : colors.border,
        },
        selected && styles.selected,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      {icon}
      <Text style={[styles.text, selected && styles.selectedText, { color: selected ? colors.primary : colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          style={styles.removeBtn}
        >
          <Text style={[styles.removeText, { color: colors.textMuted }]}>×</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    minHeight: 36,
    borderWidth: 1,
  },
  filter: {},
  selected: {},
  text: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  selectedText: {},
  removeBtn: { marginLeft: spacing.xxs },
  removeText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.tight,
  },
});