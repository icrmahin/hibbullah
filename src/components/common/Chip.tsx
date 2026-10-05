import { Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius, opacity as opacityToken } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "./Icon";
import type { IconName } from "./Icon";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Optional leading glyph — a filter icon, a category marker. */
  icon?: IconName;
};

/**
 * The one selectable pill: filters, categories, sold-as options.
 *
 * This used to be two components — `Chip` (no press feedback, Sora type,
 * dead `assist`/`input` variants, an `onRemove` nobody called) and
 * `FilterChip` (ripple, Jakarta type) — rendering the same 36px pill with
 * accidentally different borders and type. The Survivor is `FilterChip`'s
 * paint with `Chip`'s name: `primarySoft`/`accent` when selected,
 * `backgroundAlt`/`borderLight` when not, ripple-only press feedback
 * clipped by `overflow: hidden`, and a real `disabled` state
 * (`opacity.disabled`, non-pressable) that neither predecessor had.
 */
export default function Chip({ label, selected = false, onPress, disabled = false, icon }: ChipProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: colors.ripple.primary, borderless: false }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primarySoft : colors.backgroundAlt,
          borderColor: selected ? colors.accent : colors.borderLight,
          opacity: disabled ? opacityToken.disabled : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? colors.accent : colors.textMuted} /> : null}
      <Text style={[styles.text, { color: selected ? colors.accent : colors.textMuted }]} numberOfLines={1}>
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
