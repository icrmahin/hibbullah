import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import SearchBar from "../../../components/common/SearchBar";
import Icon from "../../../components/common/Icon";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import EmptyState from "../../../components/common/EmptyState";
import { radius } from "../../../constants/sizes";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";
import { useCategories } from "../../../hooks/useProducts";
import { useBottomInset } from "../../../hooks/useBottomInset";
import { isSearchableTerm } from "../../../services/searchQuery";

const DRAW_DISTANCE = 600;

export default function CustomerCategoriesScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const [query, setQuery] = useState("");
  const { data: categories, loading, error, reload } = useCategories(query);
  const searching = isSearchableTerm(query);

  return (
    <Screen header={<ScreenHeader title="Categories" onBack={goBack} />}>
      <FlashList
        data={categories}
        keyExtractor={(item) => item.id}
        drawDistance={DRAW_DISTANCE}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, { backgroundColor: colors.backgroundAlt }, pressed && styles.pressed]}
            onPress={() =>
              router.push({
                pathname: "/(customer)/products/category/[categoryId]",
                params: { categoryId: item.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Browse ${item.name}`}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
              <Icon name="category" size={18} color={colors.accent} />
            </View>
            <Text style={[styles.rowText, { color: colors.text }]} numberOfLines={2}>
              {item.name}
            </Text>
            <Icon name="chevron-right" size={18} color={colors.textMuted} />
          </Pressable>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Search categories"
            />
            {!loading && !error ? (
              <Text style={[styles.resultText, { color: colors.textMuted }]}>
                {categories.length}
                {hasMoreSuffix(categories.length)}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Loading categories" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : searching ? (
            <EmptyState
              title="No categories"
              message={`No category matches "${query.trim()}".`}
              actionLabel="Clear search"
              onAction={() => setQuery("")}
              icon="search-off"
            />
          ) : (
            <EmptyState
              title="No categories"
              message="Categories will appear here once added."
              icon="category"
            />
          )
        }
      />
    </Screen>
  );
}

/** The lookup is capped, so a full page means there may be more behind it. */
function hasMoreSuffix(count: number): string {
  return count >= 200 ? "+ categories" : count === 1 ? " category" : " categories";
}

/** The category icon well is a circle: radius derived from its size, not the 2/6/8 scale. */
const ICON_WRAP_SIZE = 36;

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  resultText: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 60,
  },
  iconWrap: {
    width: ICON_WRAP_SIZE,
    height: ICON_WRAP_SIZE,
    borderRadius: ICON_WRAP_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  pressed: { opacity: 0.7 },
});
