import { router } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { goToProduct } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useFavorites } from "../../../providers/FavoritesProvider";
import ProductCard from "../../../components/products/ProductCard";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import EmptyState from "../../../components/common/EmptyState";
import LoadingState from "../../../components/common/LoadingState";
import Icon from "../../../components/common/Icon";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";
import { useResponsive } from "../../../hooks/useResponsive";
import { useBottomInset } from "../../../hooks/useBottomInset";

export default function FavoritesScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { items, loading } = useFavorites();
  // Two per row on a phone, growing from there. The expression this replaces was the same
  // division of the screen width by two that the home screen had, in a second file, which
  // is why favourites stayed two-across forever while everything else was made responsive.
  const { columns, cardWidth } = useResponsive();

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Favorites" />}>
        <LoadingState label="Loading favorites" />
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen header={<ScreenHeader title="Favorites" subtitle="Your hand-picked medicines" />}>
        <EmptyState
          title="No favorites yet"
          message="Tap the heart on any product to save it here — most recent first."
          actionLabel="Browse products"
          onAction={() => router.push("/(customer)/(tabs)/products")}
          icon="favorite"
        />
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader title="Favorites" subtitle={`${items.length} saved · recent first`} />}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        // FlatList, unlike FlashList, has `columnWrapperStyle`, so the gutter is a real gap
        // rather than the paired half-padding the catalog uses to keep cells on one rhythm.
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth, marginBottom: spacing.md }}>
            <ProductCard
              product={item}
              compact
              onPress={(p) => goToProduct(p.id)}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  hintRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  hint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
});
