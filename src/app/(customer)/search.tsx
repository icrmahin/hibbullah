/* eslint-disable react-hooks/set-state-in-effect -- seeding the input from a route param requires setState inside an effect */
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { goBack, goToProduct } from "@/utils/navigation";
import { useThemeColors } from "../../providers/ThemeProvider";
import Screen from "../../components/common/Screen";
import ScreenHeader from "../../components/common/ScreenHeader";
import SearchBar from "../../components/common/SearchBar";
import ProductCard from "../../components/products/ProductCard";
import LoadingState from "../../components/common/LoadingState";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { radius } from "../../constants/sizes";
import { useResponsive } from "../../hooks/useResponsive";
import { useProducts } from "../../hooks/useProducts";
import { useBottomInset } from "../../hooks/useBottomInset";
import { isSearchableTerm } from "../../services/searchQuery";

const DRAW_DISTANCE = 1200

/**
 * Shown before anything is typed, so the screen is never a blank box.
 *
 * These are also the only place the app teaches what search understands, so the list has to
 * cover what the function can actually match: a generic ("Paracetamol"), a brand ("Napa"),
 * a company ("Square"), and a medicine name. "Square" is here because company search is the
 * thing a customer reaches for in this market — "Square" *is* how the brand is known, and it
 * lives in `manufacturers.name` rather than in `products.brand`. Listing only product-shaped
 * terms would have left the company path discoverable by nobody.
 *
 * "Square" is also real data in this project, so tapping it returns rows; the rest are
 * generic examples a customer might not have.
 */
const SUGGESTIONS = [
  "Paracetamol",
  "Napa",
  "Square",
  "Seclo",
  "Azithromycin",
  "Cefixime",
  "Omeprazole",
  "Montelukast",
  "Vitamin D",
];

export default function CustomerSearchScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  // Seeded from the home screen's "See all N results", so arriving here with a
  // query already shows those results instead of an empty screen.
  const params = useLocalSearchParams<{ query?: string }>();
  const [query, setQuery] = useState(params.query ?? "");
  // Two product cards per row on a phone, growing from there — the same grid the catalog
  // and the home page use, so a search result sits where the product it points at sits.
  const { columns } = useResponsive();

  useEffect(() => {
    const seeded = params.query;
    if (typeof seeded === "string" && seeded) setQuery(seeded);
  }, [params.query]);

  // useProducts rather than useProductSearch: the same hook backs every other
  // list in the app, so search pages the same way and the debounce, abort and
  // ranking are identical to the rest of the catalog.
  const {
    data: results,
    loading,
    loadingMore,
    error,
    total,
    hasMore,
    reload,
    loadMore,
  } = useProducts({ query });

  const searching = isSearchableTerm(query);
  const trimmed = query.trim();

  const resultText = useMemo(() => {
    if (!searching) return "";
    if (loading) return "Searching…";
    if (total > 0) return `${total} ${total === 1 ? "match" : "matches"} for "${trimmed}"`;
    return `No matches for "${trimmed}"`;
  }, [searching, loading, total, trimmed]);

  return (
    <Screen header={<ScreenHeader title="Search" onBack={() => goBack()} />}>
      <FlashList
        data={results}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        key={`cols-${columns}`}
        drawDistance={DRAW_DISTANCE}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        renderItem={({ item }) => (
          <View style={styles.gridItem}>
            <ProductCard
              product={item}
              onPress={(product) => goToProduct(product.id)}
            />
          </View>
        )}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Search by medicine, brand or generic"
              autoFocus
            />
            {resultText ? (
              <Text style={[styles.resultText, { color: colors.textMuted }]}>{resultText}</Text>
            ) : null}
            {!searching && !trimmed ? (
              <View style={styles.suggestions}>
                <Text style={[styles.suggestionsLabel, { color: colors.textMuted }]}>
                  Try one of these
                </Text>
                <View style={styles.suggestionRow}>
                  {SUGGESTIONS.map((term) => (
                    <Pressable
                      key={term}
                      onPress={() => setQuery(term)}
                      style={({ pressed }) => [
                        styles.suggestion,
                        {
                          backgroundColor: colors.primarySoft,
                          borderColor: colors.borderLight,
                        },
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Search for ${term}`}
                    >
                      <Text style={[styles.suggestionText, { color: colors.accent }]}>
                        {term}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <LoadingState label="Loading more" />
            </View>
          ) : null
        }
        // The error lives here rather than in `ListHeaderComponent`: the state
        // components carry `flex: 1`, which collapses to nothing above a list and
        // leaves the failure invisible. As the empty component it is the whole
        // content area, the same place loading and "no matches" render.
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Searching" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : searching ? (
            <EmptyState
              title="No matches"
              message={`Nothing matches "${trimmed}". Search by medicine name, brand, or generic name — and check the spelling.`}
              actionLabel="Clear search"
              onAction={() => setQuery("")}
            />
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Half the gutter here, half on every cell — the same pairing the catalog uses,
  // because FlashList v2 has no `columnWrapperStyle`. The two halves add up to
  // `spacing.lg`, which is the page margin every other screen uses, so a search
  // result sits exactly where the product it points at sits.
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  header: { gap: spacing.md, paddingBottom: spacing.md, paddingHorizontal: spacing.xs },
  resultText: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  gridItem: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  suggestions: { gap: spacing.sm },
  suggestionsLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  suggestionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  suggestion: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  footer: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xs },
  pressed: { opacity: 0.6 },
});
