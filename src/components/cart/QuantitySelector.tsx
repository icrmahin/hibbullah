import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius, opacity as opacityToken } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "../common/Icon";

export default function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  const colors = useThemeColors();
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View
      style={[
        styles.row,
        { borderColor: colors.borderLight },
      ]}
    >
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={atMin}
        hitSlop={8}
        android_ripple={{ color: colors.ripple.primary, borderless: false }}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        accessibilityState={{ disabled: atMin }}
        style={[styles.control, atMin && { opacity: opacityToken.disabled }]}
      >
        <Icon name="remove" size={16} color={atMin ? colors.textMuted : colors.accent} />
      </Pressable>
      <Text
        style={[styles.value, { color: colors.text }]}
        accessibilityRole="text"
        accessibilityLabel={`Quantity ${value}`}
      >
        {value}
      </Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={atMax}
        hitSlop={8}
        android_ripple={{ color: colors.ripple.primary, borderless: false }}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        accessibilityState={{ disabled: atMax }}
        style={[styles.control, atMax && { opacity: opacityToken.disabled }]}
      >
        <Icon name="add" size={16} color={atMax ? colors.textMuted : colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    minHeight: 32,
  },
  control: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  value: {
    minWidth: 28,
    textAlign: "center",
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
});
