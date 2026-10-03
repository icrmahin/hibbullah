import { Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "./Icon";
import type { IconName } from "./Icon";

type FilterChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Optional leading glyph — a filter icon, a category marker. */
  icon?: IconName;
};

export default function FilterChip({ label, selected = false, onPress, icon }: FilterChipProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.ripple.primary, borderless: false }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primarySoft : colors.backgroundAlt,
          borderColor: selected ? colors.accent : colors.borderLight,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? colors.accent : colors.textMuted} /> : null}
      <Text style={[styles.text, { color: selected ? colors.accent : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  text: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
});