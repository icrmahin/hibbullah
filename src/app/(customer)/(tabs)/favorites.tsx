import { router } from "expo-router";
import { FlatList, StyleSheet, Text, View, useWindowDimensions, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useFavorites } from "../../../providers/FavoritesProvider";
import ProductCard from "../../../components/products/ProductCard";
import EmptyState from "../../../components/common/EmptyState";
import Icon from "../../../components/common/Icon";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";

export default function FavoritesScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { items, loading } = useFavorites();

  const columnWidth = (width - spacing.lg * 2 - spacing.md) / 2;

  if (!loading && items.length === 0) {
    return (
      <View style={[styles.safeArea, { backgroundColor: colors.background, paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Favorites</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Your hand-picked medicines</Text>
        </View>
        <EmptyState
          title="No favorites yet"
          message="Tap the heart on any product to save it here — most recent first."
          actionLabel="Browse products"
          onAction={() => router.push("/(customer)/(tabs)/products")}
        />
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={[styles.title, { color: colors.text }]}>Favorites</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{items.length} saved · recent first</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, spacing.lg) + 24 }]}
        columnWrapperStyle={{ gap: spacing.md }}
        renderItem={({ item }) => (
          <View style={{ width: columnWidth, marginBottom: spacing.md }}>
            <ProductCard
              product={item}
              compact
              onPress={(p) => router.push({ pathname: "/(customer)/products/[productId]", params: { productId: p.id } })}
            />
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.hintRow}>
            <Icon name="favorite" size={12} color={colors.danger} />
            <Text style={[styles.hint, { color: colors.textMuted }]}>Sorted most recent → oldest</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 2 },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: typography.caption, marginTop: 2 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  hint: { fontSize: 11 },
});
