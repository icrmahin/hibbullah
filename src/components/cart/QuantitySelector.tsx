import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius, layout } from "../../constants/sizes";
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
    <View style={[styles.row, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        style={styles.control}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        accessibilityState={{ disabled: atMin }}
      >
        <Icon name="remove" size={18} color={atMin ? colors.textMuted : colors.accent} />
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
        style={styles.control}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        accessibilityState={{ disabled: atMax }}
      >
        <Icon name="add" size={18} color={atMax ? colors.textMuted : colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    minHeight: layout.touch,
  },
  control: {
    width: layout.touch - 8,
    height: layout.touch - 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  value: {
    minWidth: 32,
    textAlign: "center",
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
});
