import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { goToProduct } from "@/utils/navigation";
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
import AdvertisementCarousel from "../../../components/advertisements/AdvertisementCarousel";
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

  const { data: products, loading, error, reload } = useProducts({ limit: 20 });
  const { data: categories } = useCategories();

  /**
   * What feeds each tab, and what each one is allowed to claim.
   *
   * "Trending" used to be `is_featured`, while the slider above it promoted whichever
   * products had a discount and the "New" tab returned `products.slice(0, 6)` — the first
   * six rows in whatever order the query happened to return. Those are three different
   * answers to "which products are special", none of them stated.
   *
   * The rules now:
   *
   *   trending  — the `is_featured` flag, and only that. It is the one signal the schema
   *               already had: an admin ticks it in the product form, so the shop decides
   *               what is popular rather than the app guessing. It is not a sales figure,
   *               and nothing on screen pretends to be one. (There is no per-product sales
   *               metric a customer is allowed to read — `orders` is owner-scoped by RLS —
   *               so a real units-sold ranking would need a new public RPC first.)
   *   discount  — a genuine reduction against the price it replaces, never `discountPercent`
   *               alone, so a row carrying a stale percentage with an equal price does not
   *               advertise a saving that does not exist.
   *   new       — newest first, by the row's own `createdAt`.
   *
   * Nothing here invents a metric; every branch filters or sorts fields that exist.
   * Inactive products are excluded once, up front, so no tab can surface an item the
   * catalog has taken off the shelf.
   */
  const onShelf = useMemo(() => products.filter((p) => p.isActive), [products]);

  const featured = useMemo(() => onShelf.filter((p) => p.isFeatured), [onShelf]);

  const discounted = useMemo(
    () =>
      onShelf.filter(
        (p) =>
          (p.discountPercent ?? 0) > 0 &&
          p.originalPrice != null &&
          p.originalPrice > p.price,
      ),
    [onShelf],
  );

  const newProducts = useMemo(
    () => [...onShelf].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)),
    [onShelf],
  );

  const activeProducts = useMemo(() => {
    if (activeTab === "trending") return featured;
    if (activeTab === "discount") return discounted;
    if (activeTab === "new") return newProducts;
    return onShelf;
  }, [activeTab, featured, discounted, newProducts, onShelf]);

  const openProduct = (product: Product) => goToProduct(product.id);

  // The search bar is an entry point, not an input: `onPress` on SearchBar renders a
  // Pressable rather than a TextInput, so the bar navigates to the search screen instead
  // of hosting a second, partial search implementation on top of the real one.
  const openSearchScreen = () => {
    router.push({ pathname: "/(customer)/search" });
  };

  const selectTab = (tab: DiscoveryTab) => setActiveTab(tab);

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

        {/*
          Header -> search -> banners -> categories -> medicines. The banner comes from
          `advertisements` (an admin writes it) and renders nothing when none is live;
          categories sit in the open instead of behind a "Filter" chip that most people
          never opened.
        */}
        <AdvertisementCarousel />

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Categories</Text>
          <Pressable onPress={() => router.push("/(customer)/products/categories")} hitSlop={8}>
            <Text style={[styles.viewAll, { color: colors.accent }]}>View all</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.discoveryControls}
        >
          {categories.length > 0 ? (
            categories.map((category) => (
              <FilterChip
                key={category.id}
                label={category.name}
                icon="category"
                onPress={() =>
                  router.push({
                    pathname: "/(customer)/products/category/[categoryId]",
                    params: { categoryId: category.id },
                  })
                }
              />
            ))
          ) : (
            <Text style={[styles.noResults, { color: colors.textMuted }]}>No categories yet</Text>
          )}
        </ScrollView>

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
          <FilterChip label="All" selected={activeTab === "all"} onPress={() => selectTab("all")} />
          <FilterChip label="Trending" selected={activeTab === "trending"} onPress={() => selectTab("trending")} />
          <FilterChip label="Discount" selected={activeTab === "discount"} onPress={() => selectTab("discount")} />
          <FilterChip label="New" selected={activeTab === "new"} onPress={() => selectTab("new")} />
        </ScrollView>

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
        ) : activeTab === "trending" ? (
          <EmptyState
            title="Nothing trending yet"
            message="No medicine has been marked as a popular pick yet. Everything we carry is under All."
            icon="trending-up"
          />
        ) : activeTab === "discount" ? (
          <EmptyState
            title="No discounts right now"
            message="Nothing is reduced at the moment. When something is, it appears here."
            icon="local-offer"
          />
        ) : activeTab === "new" ? (
          <EmptyState
            title="Nothing new yet"
            message="The most recent additions will show up here."
            icon="fiber-new"
          />
        ) : products.length === 0 ? (
          <EmptyState
            title="No medicines yet"
            message="The catalogue is empty. New medicines will appear here."
            icon="inventory-2"
          />
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
