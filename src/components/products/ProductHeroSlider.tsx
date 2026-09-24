import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, type ViewToken, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import type { Product } from "../../types/product";

const placeholder = require("@/assets/images/placeholders/product-placeholder.png");

type ProductHeroSliderProps = {
  products: Product[];
  onProductPress?: (product: Product) => void;
};

export default function ProductHeroSlider({ products, onProductPress }: ProductHeroSliderProps) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - spacing.lg * 2, 480);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<any>(null);

  // Prefer discounted or featured for promo; fallback to first products
  const promoProducts = useMemo(() => {
    const discounted = products.filter((p) => (p.discountPercent || 0) > 0).slice(0, 4);
    if (discounted.length >= 2) return discounted;
    const featured = products.filter((p) => p.isFeatured).slice(0, 4);
    if (featured.length >= 2) return featured;
    return products.slice(0, 4);
  }, [products]);

  const viewabilityConfig = useMemo(() => ({ viewAreaCoveragePercentThreshold: 50 }), []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  // Calm autoplay — 5s, pause on interaction is handled by viewability
  useEffect(() => {
    if (promoProducts.length <= 1) return;
    const id = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % promoProducts.length;
        flatListRef.current?.scrollToOffset({ offset: next * (cardWidth + spacing.md), animated: true });
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, [promoProducts.length, cardWidth]);

  if (promoProducts.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={{ width: cardWidth, alignSelf: "center" }}>
        {/* Using FlatList via require to avoid import change — keep simple ScrollView-like */}
      </View>
      <PromoFlatList
        flatListRef={flatListRef}
        products={promoProducts}
        cardWidth={cardWidth}
        currentIndex={currentIndex}
        colors={colors}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onProductPress={onProductPress}
      />
      {promoProducts.length > 1 ? (
        <View style={styles.dots}>
          {promoProducts.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentIndex && styles.dotActive,
                { backgroundColor: index === currentIndex ? colors.primary : colors.borderLight },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PromoFlatList({
  flatListRef,
  products,
  cardWidth,
  colors,
  viewabilityConfig,
  onViewableItemsChanged,
  onProductPress,
}: any) {
  return (
    <FlatList
      ref={flatListRef}
      data={products}
      horizontal
      pagingEnabled={false}
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + spacing.md}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
      keyExtractor={(item: Product) => item.id}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      renderItem={({ item }: { item: Product }) => (
        <PromoCard product={item} cardWidth={cardWidth} colors={colors} onPress={() => onProductPress?.(item)} />
      )}
    />
  );
}

function PromoCard({
  product,
  cardWidth,
  colors,
  onPress,
}: {
  product: Product;
  cardWidth: number;
  colors: any;
  onPress?: () => void;
}) {
  const discount = product.discountPercent;
  const headline = discount && discount >= 20 ? `UP TO ${discount}% OFF` : discount ? `${discount}% OFF` : "Special offer";
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        {
          width: cardWidth,
          backgroundColor: colors.primarySoft,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${headline} ${product.name}`}
    >
      <View style={styles.cardLeft}>
        <Text style={[styles.headline, { color: colors.primary }]}>{headline}</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
          Selected medicines
        </Text>
        <Text style={[styles.limit, { color: colors.textMuted }]}>Limited-time offer</Text>
        <View style={[styles.cta, { backgroundColor: colors.primary }]}>
          <Text style={[styles.ctaText, { color: colors.white }]}>Shop now</Text>
        </View>
      </View>
      <View style={[styles.visualWrap, { backgroundColor: colors.backgroundAlt }]}>
        <Image
          source={product.image || product.primaryImage ? { uri: product.image || product.primaryImage } : placeholder}
          placeholder={placeholder}
          contentFit="contain"
          transition={200}
          style={styles.visualImage}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    minHeight: 148,
  },
  cardLeft: {
    flex: 1,
    gap: 4,
  },
  headline: {
    fontFamily: fontFamily.soraBold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  sub: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  limit: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    marginTop: 2,
  },
  cta: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  ctaText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
  },
  visualWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: spacing.xs,
  },
  visualImage: {
    width: "100%",
    height: "100%",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
  },
});
