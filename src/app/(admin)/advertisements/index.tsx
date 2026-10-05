import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import HeaderAction from "../../../components/common/HeaderAction";
import ResponsiveContainer from "../../../components/common/ResponsiveContainer";
import EmptyState from "../../../components/common/EmptyState";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import StatusBadge from "../../../components/common/StatusBadge";
import Icon from "../../../components/common/Icon";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useAdvertisements } from "../../../hooks/useAdvertisements";
import { useBottomInset } from "../../../hooks/useBottomInset";
import { setAdvertisementActive } from "../../../services/advertisements";
import { spacing } from "../../../constants/spacing";
import { radius } from "../../../constants/sizes";
import { fontFamily, fontSize, lineHeight, letterSpacing } from "../../../constants/typography";
import type { StatusTone } from "../../../components/common/StatusBadge";
import type { Advertisement, AdvertisementDestination } from "../../../types/advertisement";

const DESTINATION_LABEL: Record<AdvertisementDestination, string> = {
  none: "No destination",
  product: "Medicine",
  category: "Category",
  manufacturer: "Manufacturer",
  url: "Website link",
};

/**
 * What the schedule says right now, as one word.
 *
 * `isActive` on its own would call a banner that starts next week "Live", and one that
 * ended last month "Live" too. The dates belong to the decision because each state wants
 * a different action: press play, move the dates, or leave it alone.
 */
function scheduleState(ad: Advertisement): { label: string; tone: StatusTone } {
  if (!ad.isActive) return { label: "Paused", tone: "neutral" };
  const now = Date.now();
  if (ad.startsAt && Date.parse(ad.startsAt) > now) return { label: "Scheduled", tone: "info" };
  if (ad.endsAt && Date.parse(ad.endsAt) < now) return { label: "Ended", tone: "neutral" };
  return { label: "Live", tone: "success" };
}

type AdvertisementRowProps = {
  ad: Advertisement;
  /** Writes the optimistic flip into the list's own state. */
  onToggle: (id: string, isActive: boolean) => void;
};

function AdvertisementRow({ ad, onToggle }: AdvertisementRowProps) {
  const colors = useThemeColors();
  const { label, tone } = scheduleState(ad);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    // Optimistic: the switch must move now or it looks stuck. If the write fails the row
    // is left un-flipped and the next focus pass re-reads the truth from the server.
    onToggle(ad.id, !ad.isActive);
    setBusy(true);
    try {
      await setAdvertisementActive(ad.id, !ad.isActive);
    } catch {
      onToggle(ad.id, ad.isActive);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.row, { backgroundColor: colors.backgroundAlt }]}>
      <Pressable
        onPress={() =>
          router.push({ pathname: "/(admin)/advertisements/[adId]", params: { adId: ad.id } })
        }
        android_ripple={{ color: colors.ripple.primary }}
        style={styles.rowMain}
        accessibilityRole="button"
        accessibilityLabel={`Edit banner ${ad.title}`}
      >
        <Image
          source={{ uri: ad.imageUrl }}
          style={[styles.thumb, { backgroundColor: colors.background }]}
          contentFit="cover"
        />
        <View style={styles.rowText}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {ad.title}
          </Text>
          {ad.subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {ad.subtitle}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {DESTINATION_LABEL[ad.destinationType]} · order {ad.sortOrder}
          </Text>
        </View>
        <StatusBadge label={label} tone={tone} />
        <Icon name="chevron-right" size={20} color={colors.textMuted} />
      </Pressable>
      <View style={styles.pause}>
        <Switch
          value={ad.isActive}
          disabled={busy}
          onValueChange={() => void toggle()}
          trackColor={{ false: colors.border, true: colors.primarySoft }}
          thumbColor={ad.isActive ? colors.accent : colors.textMuted}
          accessibilityLabel={`${ad.isActive ? "Pause" : "Show"} ${ad.title}`}
        />
      </View>
    </View>
  );
}

export default function AdminAdvertisementsScreen() {
  const bottomInset = useBottomInset();
  const { data, loading, error, reload } = useAdvertisements("admin");
  // Patched rows between the toggle and the next focus-driven reload.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const subtitle = data.length > 0 ? `${time} · ${data.length} banners` : time;

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Advertisements" subtitle={subtitle} />}>
        <LoadingState label="Loading banners" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen header={<ScreenHeader title="Advertisements" subtitle={`${time} · live`} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title="Advertisements"
          subtitle={subtitle}
          action={
            <HeaderAction label="Add" icon="add" onPress={() => router.push("/(admin)/advertisements/add")} accessibilityLabel="Add advertisement" />
          }
        />
      }
    >
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        <ResponsiveContainer sidebarAware>
        {data.length === 0 ? (
          <EmptyState
            title="No banners yet"
            message="A banner is a picture with words you write. It sits under the search bar, above the categories, and leads wherever you point it."
          />
        ) : (
          data.map((ad) => (
            <AdvertisementRow
              key={ad.id}
              ad={overrides[ad.id] === undefined ? ad : { ...ad, isActive: overrides[ad.id] }}
              onToggle={(id, next) => setOverrides((prev) => ({ ...prev, [id]: next }))}
            />
          ))
        )}
        </ResponsiveContainer>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  row: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 64,
    overflow: "hidden",
  },
  thumb: {
    width: 72,
    height: 48,
    borderRadius: radius.sm,
  },
  rowText: { flex: 1, gap: spacing.xxs },
  title: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  subtitle: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  meta: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
    textTransform: "uppercase",
    letterSpacing: letterSpacing.wide,
  },
  pause: {
    paddingHorizontal: spacing.sm,
    alignItems: "flex-end",
  },
});
