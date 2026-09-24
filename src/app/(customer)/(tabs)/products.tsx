import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import SoftHeader from "../../../components/common/SoftHeader";
import SearchBar from "../../../components/common/SearchBar";
import ResponsiveContainer from "../../../components/common/ResponsiveContainer";
import ProductCard from "../../../components/products/ProductCard";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import spacing from "../../../constants/spacing";
import { useResponsive } from "../../../hooks/useResponsive";
import { useProducts, useCategories, useManufacturers } from "../../../hooks/useProducts";

export default function CustomerProductsScreen() {
  const colors = useThemeColors();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [manufacturerId, setManufacturerId] = useState<string | null>(null);
  const { isMobile, isTablet, columns } = useResponsive();

  // FIX: loading/error/reload were destructured but never rendered — the tab showed a bare
  // "No products found" empty state during the initial fetch and on any failure (trip: no
  // loading spinner / no error surface on the main products tab). categoriesLoading /
  // manufacturersLoading were also unused; loading/error/reload are now wired into the list.
  const { data: products, loading, error, reload } = useProducts({ categoryId: categoryId || undefined, manufacturerId: manufacturerId || undefined, query });
  const { data: categories } = useCategories();
  const { data: manufacturers } = useManufacturers();

  const gridColumns = isMobile ? 1 : isTablet ? 2 : columns;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Products" subtitle="Browse by category and manufacturer" />
      <FlatList
        data={products}
        contentContainerStyle={styles.container}
        keyExtractor={(item) => item.id}
        numColumns={gridColumns}
        columnWrapperStyle={gridColumns > 1 ? styles.gridRow : undefined}
        renderItem={({ item }) => (
          <View style={[styles.gridItem, gridColumns > 1 && { flexBasis: `${100 / gridColumns - 1}%` }]}>
            <ProductCard product={item} onPress={(product) => router.push({ pathname: "/(customer)/products/[productId]", params: { productId: product.id } })} />
          </View>
        )}
        ListHeaderComponent={
          <ResponsiveContainer>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search products" />
            <Text style={[styles.label, { color: colors.text }]}>Categories</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              <Pressable style={[styles.chip, !categoryId && styles.chipSelected, { backgroundColor: !categoryId ? colors.backgroundAlt : colors.primarySoft, borderColor: !categoryId ? colors.border : colors.primary }]} onPress={() => setCategoryId(null)}>
                <Text style={[styles.chipText, !categoryId && styles.chipSelectedText, { color: !categoryId ? colors.text : colors.primary }]}>All</Text>
              </Pressable>
              {categories.map((category) => (
                <Pressable key={category.id} style={[styles.chip, categoryId === category.id && styles.chipSelected, { backgroundColor: categoryId === category.id ? colors.primarySoft : colors.backgroundAlt, borderColor: categoryId === category.id ? colors.primary : colors.border }]} onPress={() => setCategoryId(category.id)}>
                  <Text style={[styles.chipText, categoryId === category.id && styles.chipSelectedText, { color: categoryId === category.id ? colors.primary : colors.text }]}>{category.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[styles.label, { color: colors.text }]}>Manufacturers</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              <Pressable style={[styles.chip, !manufacturerId && styles.chipSelected, { backgroundColor: !manufacturerId ? colors.backgroundAlt : colors.primarySoft, borderColor: !manufacturerId ? colors.border : colors.primary }]} onPress={() => setManufacturerId(null)}>
                <Text style={[styles.chipText, !manufacturerId && styles.chipSelectedText, { color: !manufacturerId ? colors.text : colors.primary }]}>All</Text>
              </Pressable>
              {manufacturers.map((manufacturer) => (
                <Pressable key={manufacturer.id} style={[styles.chip, manufacturerId === manufacturer.id && styles.chipSelected, { backgroundColor: manufacturerId === manufacturer.id ? colors.primarySoft : colors.backgroundAlt, borderColor: manufacturerId === manufacturer.id ? colors.primary : colors.border }]} onPress={() => setManufacturerId(manufacturer.id)}>
                  <Text style={[styles.chipText, manufacturerId === manufacturer.id && styles.chipSelectedText, { color: manufacturerId === manufacturer.id ? colors.primary : colors.text }]}>{manufacturer.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[styles.resultText, { color: colors.textMuted }]}>{products.length} products</Text>
          </ResponsiveContainer>
        }
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Loading products" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <Text style={[styles.resultText, { color: colors.textMuted }]}>No products found</Text>
          )
        }
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
        refreshing={!!loading}
        onRefresh={() => reload()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  gridRow: { gap: spacing.md },
  gridItem: { marginBottom: spacing.md },
  label: { fontWeight: "700", marginTop: spacing.xl, marginBottom: spacing.sm, fontSize: 12 },
  chipsRow: { paddingVertical: spacing.sm, gap: spacing.sm },
  chip: { backgroundColor: "#FFFFFF", borderColor: "#D0D6D4", borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm },
  chipText: { color: "#18201E", fontSize: 12, fontWeight: "600" },
  chipSelected: {},
  chipSelectedText: { color: "#123C35", fontWeight: "600" },
  resultText: { fontSize: 12, marginTop: spacing.md, marginBottom: spacing.md },
});