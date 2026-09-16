import { Pressable, StyleSheet, Text, View } from "react-native";
import colors from "../../constants/colors";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

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
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        style={styles.control}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        accessibilityState={{ disabled: value <= min }}
      >
        <Text style={styles.symbol}>−</Text>
      </Pressable>
      <Text style={styles.value} accessibilityRole="text">{value}</Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        style={styles.control}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        accessibilityState={{ disabled: value >= max }}
      >
        <Text style={styles.symbol}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.backgroundAlt,
    borderRadius: sizes.borderRadius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    minHeight: sizes.touch,
  },
  control: {
    width: sizes.touch,
    height: sizes.touch,
    alignItems: "center",
    justifyContent: "center",
  },
  symbol: { color: colors.primary, fontSize: typography.headline, fontWeight: "600" },
  value: { color: colors.text, fontSize: typography.headline, fontWeight: "600", minWidth: 24, textAlign: "center" },
});
