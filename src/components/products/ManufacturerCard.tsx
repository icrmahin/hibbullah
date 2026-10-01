import { Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography, { fontFamily } from "../../constants/typography";
import type { Manufacturer } from "../../types/manufacturer";

export default function ManufacturerCard({
  manufacturer,
  onPress,
}: {
  manufacturer: Manufacturer;
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      style={[
        styles.card,
        {
          backgroundColor: colors.backgroundAlt,
          borderColor: colors.border,
        },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.name, { color: colors.text }]}>{manufacturer.name}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        {manufacturer.country ?? "Kenya"} · {manufacturer.productCount ?? 0} products
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: sizes.cardRadius,
    borderWidth: 1,
    padding: spacing.lg,
  },
  name: { fontFamily: fontFamily.soraSemiBold, fontSize: typography.body },
  meta: { fontSize: typography.caption, marginTop: 4 },
});