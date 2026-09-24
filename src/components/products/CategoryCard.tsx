import { Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import type { Category } from "../../types/category";

export default function CategoryCard({
  category,
  onPress,
}: {
  category: Category;
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
      <Text style={[styles.name, { color: colors.text }]}>{category.name}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>{category.productCount ?? 0} products</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: sizes.cardRadius,
    borderWidth: 1,
    padding: spacing.lg,
  },
  name: { fontSize: typography.body, fontWeight: "600" },
  meta: { fontSize: typography.caption, marginTop: 4 },
});