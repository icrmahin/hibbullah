import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { radius } from "../../constants/sizes";
import { fontFamily, fontSize, lineHeight, letterSpacing } from "../../constants/typography";
import Icon from "../common/Icon";
import { goToProduct } from "../../utils/navigation";
import { useAdvertisements } from "../../hooks/useAdvertisements";
import type { Advertisement } from "../../types/advertisement";

/**
 * The homepage banner, from the database instead of from a formula.
 *
 * What this replaces took the first four products, preferred whichever had a discount,
 * and then printed copy nobody ever wrote over them — "Special offer", "Selected
 * medicines", "Limited-time offer", "Shop now". Every one of those strings was a claim
 * the shop had not made, and every product it chose was one the owner had not picked.
 *
 * Here nothing is generated: the image, the words and where it points are all columns an
 * admin typed, and the row only reaches this screen if the policy agreed it is live.
 * With no live banner this renders `null` rather than an empty frame — a missing banner
 * is a normal state, not an error.
 */
export default function AdvertisementCarousel() {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const { data: advertisements, loading } = useAdvertisements("live");
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Advertisement>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // The carousel lives inside the page's own horizontal padding, so the viewport is the
  // window minus that gutter — measuring the window here and padding again inside the
  // list is what made the previous slider sit two gutters in from the edge and snap to
  // intervals wider than the space actually visible.
  const gutter = spacing.lg * 2;
  // A slice of the next banner peeks in, which is what says "swipeable" without a label.
  const cardWidth = Math.max(width - gutter - spacing.xl, 240);
  const step = cardWidth + spacing.md;

  const live = useMemo(() => advertisements, [advertisements]);

  const viewabilityConfig = useMemo(() => ({ viewAreaCoveragePercentThreshold: 50 }), []);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const index = viewableItems[0]?.index;
    if (index != null) setCurrentIndex(index);
  }, []);

  // Calm autoplay — one advance every five seconds, only when there is more than one to
  // advance to, and never under Reduced Motion, where an unprompted slide is exactly the
  // motion the setting exists to stop.
  useEffect(() => {
    if (live.length <= 1 || reducedMotion) return;
    const id = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % live.length;
        listRef.current?.scrollToOffset({ offset: next * step, animated: true });
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, [live.length, step, reducedMotion]);

  if (loading && live.length === 0) return null;
  if (live.length === 0) return null;

  return (
    <>
      <FlatList
        ref={listRef}
        data={live}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentContainerStyle={{ gap: spacing.md }}
        keyExtractor={(item) => item.id}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item }) => (
          <AdvertisementCard advertisement={item} cardWidth={cardWidth} />
        )}
      />
      {live.length > 1 ? (
        <View style={styles.dots}>
          {live.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.dot,
                index === currentIndex && styles.dotActive,
                { backgroundColor: index === currentIndex ? colors.primary : colors.borderLight },
              ]}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

function AdvertisementCard({ advertisement, cardWidth }: { advertisement: Advertisement; cardWidth: number }) {
  const colors = useThemeColors();
  const { destinationType, destinationId, title, subtitle, imageUrl } = advertisement;

  /**
   * The five destinations, in one place.
   *
   * `product` goes through `goToProduct` like every other product tap in the app, so an
   * ad can never become the tenth hand-built `/products/undefined` path.
   */
  const open = useCallback(() => {
    if (destinationType === "product") goToProduct(destinationId);
    else if (destinationType === "category")
      router.push({
        pathname: "/(customer)/products/category/[categoryId]",
        params: { categoryId: String(destinationId) },
      });
    else if (destinationType === "manufacturer")
      router.push({
        pathname: "/(customer)/products/manufacturer/[manufacturerId]",
        params: { manufacturerId: String(destinationId) },
      });
    else if (destinationType === "url" && destinationId) void Linking.openURL(destinationId);
  }, [destinationType, destinationId]);

  // "Nothing" means the picture is decoration. Making it a button that does nothing would
  // advertise an action the banner does not have, so it is not a button at all.
  const pressable = destinationType !== "none";

  const body = (
    <>
      <Image
        source={{ uri: imageUrl }}
        contentFit="cover"
        transition={200}
        style={[styles.image, { backgroundColor: colors.background }]}
      />
      <View style={styles.textRow}>
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {pressable ? (
          <View style={[styles.chevron, { backgroundColor: colors.primarySoft }]}>
            <Icon name="arrow-forward" size={16} color={colors.accent} />
          </View>
        ) : null}
      </View>
    </>
  );

  if (!pressable) {
    return (
      <View
        style={[styles.card, { width: cardWidth, backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}
        accessibilityRole="image"
        accessibilityLabel={title}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={open}
      android_ripple={{ color: colors.ripple.primary, borderless: false }}
      style={[
        styles.card,
        { width: cardWidth, backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight },
      ]}
      accessibilityRole="link"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint="Opens the advertised page"
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 132,
  },
  textRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textBlock: { flex: 1, gap: spacing.xxs },
  title: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  subtitle: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  dotActive: {
    width: 18,
  },
});
