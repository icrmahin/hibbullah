import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useShadows } from "../../../constants/shadows";
import AppLogo from "../../../components/common/AppLogo";
import SearchBar from "../../../components/common/SearchBar";
import Icon from "../../../components/common/Icon";
import ProductCard from "../../../components/products/ProductCard";
import ProductHeroSlider from "../../../components/products/ProductHeroSlider";
import spacing from "../../../constants/spacing";
import { radius, layout } from "../../../constants/sizes";
import type { Product } from "../../../types/product";
import { useNotifications } from "../../../hooks/useNotifications";
import { useProducts, useCategories } from "../../../hooks/useProducts";

type DiscoveryTab = "all" | "trending" | "discount" | "new";

export default function CustomerHomeScreen() {
  const colors = useThemeColors();
  const shadows = useShadows();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { unreadCount } = useNotifications();

  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<DiscoveryTab>("all");
  const [showFilter, setShowFilter] = useState(false);

  const { data: products } = useProducts();
  const { data: categories } = useCategories();

  const featured = useMemo(() => products.filter((p) => p.isFeatured), [products]);
  const newProducts = useMemo(() => [...products].slice(0, 6), [products]);
  const discounted = useMemo(() => products.filter((p) => (p.discountPercent || 0) > 0), [products]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 4);
    return products.filter((p) => [p.name, p.brand, p.genericName].join(" ").toLowerCase().includes(q)).slice(0, 5);
  }, [query, products]);

  const activeProducts = useMemo(() => {
    if (activeTab === "all") return products;
    if (activeTab === "trending") return featured;
    if (activeTab === "discount") return discounted;
    return newProducts;
  }, [activeTab, featured, discounted, newProducts, products]);

  const openProduct = (product: Product) => {
    setSearchFocused(false);
    router.push({ pathname: "/(customer)/products/[productId]", params: { productId: product.id } });
  };

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Feather-light island header */}
      <View style={[styles.headerWrap, { paddingTop: insets.top + spacing.sm }]}>
        <View
          style={[
            styles.headerIsland,
            { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.sm },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={styles.brandRow}>
              <AppLogo size={30} />
              <Text style={[styles.brandName, { color: colors.text }]}>Hibbullah</Text>
            </View>
            <Pressable
              onPress={() => router.push("/(customer)/account/notifications" as any)}
              accessibilityRole="button"
              accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
              style={[styles.cartButton, { backgroundColor: colors.background, borderColor: colors.borderSoft }]}
            >
              <Icon name="notifications" size={18} color={colors.primary} />
              {unreadCount > 0 ? (
                <View style={[styles.cartBadge, { backgroundColor: colors.danger }]}>
                  <Text style={[styles.cartBadgeText, { color: colors.white }]}>
                    {unreadCount > 99 ? "99+" : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.lg) + 8 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchArea}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            onFocus={() => setSearchFocused(true)}
            placeholder="Search medicine"
          />
          {searchFocused ? (
            <View style={[styles.searchPanel, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft }]}>
              <Text style={[styles.searchPanelTitle, { color: colors.textMuted }]}>
                {query ? "Matches" : "Popular"}
              </Text>
              <FlatList
                data={searchResults}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Pressable style={styles.searchResult} onPress={() => openProduct(item)}>
                    <Text style={[styles.searchResultName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.searchResultMeta, { color: colors.textMuted }]} numberOfLines={1}>
                      {item.brand} · {item.genericName}
                    </Text>
                  </Pressable>
                )}
                ListEmptyComponent={<Text style={[styles.noResults, { color: colors.textMuted }]}>No medicines found — try another name.</Text>}
              />
              <Pressable onPress={() => setSearchFocused(false)} style={styles.searchClose}>
                <Text style={[styles.searchCloseText, { color: colors.primary }]}>Close</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.heroSection}>
          <ProductHeroSlider products={products.length > 0 ? products.slice(0, 4) : []} onProductPress={openProduct} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Browse medicines</Text>
          <Pressable onPress={() => router.push("/(customer)/(tabs)/products" as any)}>
            <Text style={[styles.viewAll, { color: colors.primary }]}>View all</Text>
          </Pressable>
        </View>

        <View style={styles.discoveryRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.discoveryControls}>
            <FilterPill active={showFilter} onPress={() => setShowFilter(!showFilter)} colors={colors} />
            <DiscoveryPill label="All" active={activeTab === "all" && !showFilter} onPress={() => { setActiveTab("all"); setShowFilter(false); }} colors={colors} />
            <DiscoveryPill label="Trending" active={activeTab === "trending" && !showFilter} onPress={() => { setActiveTab("trending"); setShowFilter(false); }} colors={colors} />
            <DiscoveryPill label="Discount" active={activeTab === "discount" && !showFilter} onPress={() => { setActiveTab("discount"); setShowFilter(false); }} colors={colors} />
            <DiscoveryPill label="New" active={activeTab === "new" && !showFilter} onPress={() => { setActiveTab("new"); setShowFilter(false); }} colors={colors} />
          </ScrollView>
        </View>

        {showFilter ? (
          <View style={[styles.filterPanel, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft }]}>
            <Text style={[styles.filterTitle, { color: colors.text }]}>Categories</Text>
            <View style={styles.categoryGrid}>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  style={[styles.categoryItem, { backgroundColor: colors.background, borderColor: colors.borderLight }]}
                  onPress={() => {
                    setShowFilter(false);
                    router.push({ pathname: "/(customer)/products/category/[categoryId]", params: { categoryId: category.id } });
                  }}
                >
                  <Icon name="category" size={16} color={colors.primary} />
                  <Text style={[styles.categoryName, { color: colors.text }]}>{category.name}</Text>
                </Pressable>
              ))}
              {categories.length === 0 ? <Text style={[styles.noResults, { color: colors.textMuted }]}>No categories</Text> : null}
            </View>
          </View>
        ) : null}

        <View style={styles.productsGrid}>
          {activeProducts.length > 0 ? (
            <View style={[styles.grid, { gap: spacing.md }]}>
              {activeProducts.map((product) => (
                <View key={product.id} style={[styles.gridItem, { width: (width - spacing.lg * 2 - spacing.md) / 2 }]}>
                  <ProductCard product={product} compact onPress={openProduct} />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyProducts}>
              <Icon name="inventory-2" size={28} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No medicines found</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Try another medicine name or category.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterPill({ active, onPress, colors }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.discoveryPill, active && styles.discoveryPillActive, { backgroundColor: active ? colors.primary : colors.backgroundAlt, borderColor: colors.borderSoft }]}
    >
      <Icon name="filter-list" size={14} color={active ? colors.white : colors.textMuted} />
      <Text style={[styles.discoveryPillText, { color: active ? colors.white : colors.textMuted }]}>Filter</Text>
    </Pressable>
  );
}

function DiscoveryPill({ label, active, onPress, colors }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.discoveryPill, active && styles.discoveryPillActive, { backgroundColor: active ? colors.primary : colors.backgroundAlt, borderColor: colors.borderSoft }]}
    >
      <Text style={[styles.discoveryPillText, { color: active ? colors.white : colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: "transparent" },
  headerIsland: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 38,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandName: { fontWeight: "600", fontSize: 15, letterSpacing: -0.2 },
  cartButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { fontSize: 9, fontWeight: "700" },
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  searchArea: { position: "relative", zIndex: 10, marginBottom: spacing.md },
  searchPanel: {
    position: "absolute",
    top: layout.inputHeight + 8,
    left: 0,
    right: 0,
    maxHeight: 280,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    boxShadow: "0px 8px 16px rgba(0,0,0,0.12)",
  },
  searchPanelTitle: { fontWeight: "600", fontSize: 11, marginBottom: spacing.xs, textTransform: "uppercase", letterSpacing: 0.4 },
  searchResult: { paddingVertical: spacing.sm },
  searchResultName: { fontWeight: "600", fontSize: 12 },
  searchResultMeta: { fontSize: 11, marginTop: 2 },
  noResults: { paddingVertical: spacing.sm, fontSize: 12 },
  searchClose: { alignSelf: "flex-end", marginTop: spacing.sm },
  searchCloseText: { fontSize: 12, fontWeight: "600" },
  heroSection: { marginBottom: spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { fontWeight: "700", fontSize: 14 },
  viewAll: { fontSize: 12, fontWeight: "600" },
  discoveryRow: { marginBottom: spacing.sm },
  discoveryControls: { gap: spacing.sm, paddingVertical: 4 },
  discoveryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  discoveryPillActive: {},
  discoveryPillText: { fontWeight: "600", fontSize: 12 },
  filterPanel: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  filterTitle: { fontWeight: "700", fontSize: 12, marginBottom: spacing.sm },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  categoryName: { fontWeight: "600", fontSize: 12 },
  productsGrid: { marginTop: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridItem: { marginBottom: 2 },
  emptyProducts: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontWeight: "700", fontSize: 13 },
  emptyText: { fontSize: 12, textAlign: "center" },
});
