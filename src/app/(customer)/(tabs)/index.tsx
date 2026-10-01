import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../../providers/ThemeProvider";
import AppLogo from "../../../components/common/AppLogo";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import SearchBar from "../../../components/common/SearchBar";
import Icon from "../../../components/common/Icon";
import FilterChip from "../../../components/common/FilterChip";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import EmptyState from "../../../components/common/EmptyState";
import ProductCard from "../../../components/products/ProductCard";
import ProductHeroSlider from "../../../components/products/ProductHeroSlider";
import spacing from "../../../constants/spacing";
import { radius } from "../../../constants/sizes";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";
import type { Product } from "../../../types/product";
import { useNotifications } from "../../../hooks/useNotifications";
import { useProducts, useCategories } from "../../../hooks/useProducts";
import { useResponsive } from "../../../hooks/useResponsive";
import { useBottomInset } from "../../../hooks/useBottomInset";

type DiscoveryTab = "all" | "trending" | "discount" | "new";

export default function CustomerHomeScreen() {
  const colors = useThemeColors();
  // Two product cards per row on a phone, growing from there. `cardWidth` is measured from
  // the screen rather than the content area because this grid spans the window.
  const { isMobile, cardWidth } = useResponsive();
  const bottomInset = useBottomInset();
  const { unreadCount } = useNotifications();

  const [activeTab, setActiveTab] = useState<DiscoveryTab>("all");
  const [showFilter, setShowFilter] = useState(false);

  const { data: products, loading, error, reload } = useProducts({ limit: 20 });
  const { data: categories } = useCategories();

  const featured = useMemo(() => products.filter((p) => p.isFeatured), [products]);
  const newProducts = useMemo(() => [...products].slice(0, 6), [products]);
  const discounted = useMemo(() => products.filter((p) => (p.discountPercent || 0) > 0), [products]);

  const activeProducts = useMemo(() => {
    if (activeTab === "all") return products;
    if (activeTab === "trending") return featured;
    if (activeTab === "discount") return discounted;
    return newProducts;
  }, [activeTab, featured, discounted, newProducts, products]);

  const openProduct = (product: Product) => {
    router.push({ pathname: "/(customer)/products/[productId]", params: { productId: product.id } });
  };

  // The search bar is an entry point, not an input: `onPress` on SearchBar renders a
  // Pressable rather than a TextInput, so the bar navigates to the search screen instead
  // of hosting a second, partial search implementation on top of the real one.
  const openSearchScreen = () => {
    router.push({ pathname: "/(customer)/search" });
  };

  const selectTab = (tab: DiscoveryTab) => {
    setActiveTab(tab);
    setShowFilter(false);
  };

  const homeHeader = (
    <ScreenHeader
      title="Hibbullah"
      leading={<AppLogo size={24} />}
      action={
        <Pressable
          onPress={() => router.push("/(customer)/account/notifications")}
          style={styles.headerAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        >
          <Icon name="notifications" size={20} color={colors.accent} />
          {unreadCount > 0 ? (
            <View style={[styles.headerBadge, { backgroundColor: colors.danger }]}>
              <Text style={[styles.headerBadgeText, { color: colors.textInverse }]}>
                {unreadCount > 99 ? "99+" : String(unreadCount)}
              </Text>
            </View>
          ) : null}
        </Pressable>
      }
    />
  );

  // Wider layouts get their chrome from CustomerDesktopHeader, mounted once by the layout.
  return (
    <Screen header={isMobile ? homeHeader : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SearchBar
          value=""
          onChangeText={() => {}}
          onPress={openSearchScreen}
          placeholder="Search medicine"
        />

        <ProductHeroSlider
          products={products.length > 0 ? products.slice(0, 4) : []}
          onProductPress={openProduct}
        />

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Browse medicines</Text>
          <Pressable onPress={() => router.push("/(customer)/(tabs)/products")} hitSlop={8}>
            <Text style={[styles.viewAll, { color: colors.accent }]}>View all</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.discoveryControls}
        >
          <FilterChip label="Filter" icon="filter-list" selected={showFilter} onPress={() => setShowFilter(!showFilter)} />
          <FilterChip label="All" selected={activeTab === "all" && !showFilter} onPress={() => selectTab("all")} />
          <FilterChip label="Trending" selected={activeTab === "trending" && !showFilter} onPress={() => selectTab("trending")} />
          <FilterChip label="Discount" selected={activeTab === "discount" && !showFilter} onPress={() => selectTab("discount")} />
          <FilterChip label="New" selected={activeTab === "new" && !showFilter} onPress={() => selectTab("new")} />
        </ScrollView>

        {showFilter ? (
          <View style={[styles.filterPanel, { backgroundColor: colors.backgroundAlt }]}>
            <Text style={[styles.filterTitle, { color: colors.text }]}>Categories</Text>
            <View style={styles.categoryGrid}>
              {categories.map((category) => (
                <FilterChip
                  key={category.id}
                  label={category.name}
                  icon="category"
                  onPress={() => {
                    setShowFilter(false);
                    router.push({
                      pathname: "/(customer)/products/category/[categoryId]",
                      params: { categoryId: category.id },
                    });
                  }}
                />
              ))}
              {categories.length === 0 ? (
                <Text style={[styles.noResults, { color: colors.textMuted }]}>No categories</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {loading && activeProducts.length === 0 ? (
          <View style={styles.stateBlock}>
            <LoadingState label="Loading medicines" />
          </View>
        ) : error && activeProducts.length === 0 ? (
          <View style={styles.stateBlock}>
            <ErrorState message={error} onRetry={reload} />
          </View>
        ) : activeProducts.length > 0 ? (
          <View style={[styles.grid, { gap: spacing.md }]}>
            {activeProducts.map((product) => (
              <View key={product.id} style={{ width: cardWidth }}>
                <ProductCard product={product} compact onPress={openProduct} />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            title="No medicines found"
            message="Try another medicine name or category."
            icon="inventory-2"
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  headerAction: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  headerBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadgeText: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.tiny,
    lineHeight: fontSize.tiny * lineHeight.tight,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: -0.2,
  },
  viewAll: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  discoveryControls: {
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
    paddingRight: spacing.lg,
  },
  filterPanel: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterTitle: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  noResults: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    paddingVertical: spacing.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.xs,
  },
  stateBlock: {
    minHeight: 280,
  },
});
