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
import { useManufacturers } from "../../../hooks/useProducts";
import { useBottomInset } from "../../../hooks/useBottomInset";
import { isSearchableTerm } from "../../../services/searchQuery";

const DRAW_DISTANCE = 600

export default function CustomerManufacturersScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const [query, setQuery] = useState("");
  const { data: manufacturers, loading, error, reload } = useManufacturers(query);
  const searching = isSearchableTerm(query);

  return (
    <Screen header={<ScreenHeader title="Manufacturers" onBack={() => goBack()} />}>
      <FlashList
        data={manufacturers}
        keyExtractor={(item) => item.id}
        drawDistance={DRAW_DISTANCE}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: colors.backgroundAlt },
              pressed && styles.pressed,
            ]}
            onPress={() =>
              router.push({
                pathname: "/(customer)/products/manufacturer/[manufacturerId]",
                params: { manufacturerId: item.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Browse ${item.name}`}
          >
            <View style={styles.cardTextWrap}>
              <Text style={[styles.cardText, { color: colors.text }]} numberOfLines={2}>
                {item.name}
              </Text>
              {item.country ? (
                <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.country}
                </Text>
              ) : null}
            </View>
            <Icon name="chevron-right" size={18} color={colors.textMuted} />
          </Pressable>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Search manufacturers"
            />
            {!loading && !error ? (
              <Text style={[styles.resultText, { color: colors.textMuted }]}>
                {manufacturers.length}
                {manufacturers.length >= 200
                  ? "+ manufacturers"
                  : manufacturers.length === 1
                    ? " manufacturer"
                    : " manufacturers"}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Loading manufacturers" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : searching ? (
            <EmptyState
              title="No manufacturers"
              message={`No manufacturer matches "${query.trim()}".`}
              actionLabel="Clear search"
              onAction={() => setQuery("")}
            />
          ) : (
            <EmptyState
              title="No manufacturers"
              message="Manufacturers will appear here once added."
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  resultText: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  // The card rule: white surface on the off-white page, no border, no shadow.
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 56,
  },
  cardTextWrap: { flex: 1, gap: 2 },
  cardText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  cardMeta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  pressed: { opacity: 0.6 },
});
