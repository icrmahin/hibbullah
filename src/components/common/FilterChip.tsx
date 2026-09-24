import { Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";

type FilterChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export default function FilterChip({ label, selected = false, onPress }: FilterChipProps) {
  const colors = useThemeColors();
  const shadows = useShadows();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primarySoft : colors.backgroundAlt,
          borderColor: selected ? colors.primary : colors.borderLight,
          ...shadows.xs,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Filter by ${label}`}
    >
      <Text style={[styles.text, { color: selected ? colors.primary : colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
});