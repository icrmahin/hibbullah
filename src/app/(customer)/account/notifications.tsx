import { ScrollView, StyleSheet, Text, View, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import EmptyState from "../../../components/common/EmptyState";
import { goBack } from "@/utils/navigation";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { NOTIFICATION_LIMIT } from "../../../constants/limits";
import { useNotifications } from "../../../hooks/useNotifications";
import { formatDateTime } from "../../../utils/date";
import Icon from "../../../components/common/Icon";
import type { NotificationItem } from "../../../types/notification";

function statusColor(type: NotificationItem["type"], colors: any) {
  switch (type) {
    case "alert":
      return colors.danger; // red urgent
    case "warning":
      return "#EAB308"; // yellow mid
    case "success":
      return colors.success; // green success
    case "info":
    default:
      return colors.primary; // fallback green-ish
  }
}

function statusLabel(type: NotificationItem["type"]) {
  switch (type) {
    case "alert":
      return "Urgent";
    case "warning":
      return "Attention";
    case "success":
      return "Done";
    case "info":
    default:
      return "Info";
  }
}

export default function CustomerNotificationsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { items, loading, error, reload, unreadCount, readCount, markAsRead, markAllRead, clearAll, clearRead } =
    useNotifications();

  // Destructive and irreversible, so both are confirmed before they run. `clearRead` is
  // the safer of the two and is offered first, which matches the common case: someone
  // tidying up usually wants the things they have not dealt with yet to survive.
  const confirmClearAll = () =>
    Alert.alert(
      "Clear all notifications?",
      `This permanently removes all ${items.length} of your notifications. It cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear all", style: "destructive", onPress: () => void clearAll() },
      ],
    );

  const confirmClearRead = () =>
    Alert.alert(
      "Clear read notifications?",
      `This permanently removes ${readCount} notification${readCount === 1 ? "" : "s"} you have already read. Anything unread is kept.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: () => void clearRead() },
      ],
    );

  if (loading) {
    return (
      <View style={[styles.safeArea, { backgroundColor: colors.background, paddingTop: insets.top + 52 }]}>
        <View style={[styles.floatingBack, { top: insets.top + spacing.sm, backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Pressable onPress={() => goBack()} hitSlop={8} style={styles.floatingPress}>
            <Icon name="arrow-back" size={18} color={colors.text} />
          </Pressable>
        </View>
        <LoadingState label="Loading notifications" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.safeArea, { backgroundColor: colors.background, paddingTop: insets.top + 52 }]}>
        <View style={[styles.floatingBack, { top: insets.top + spacing.sm, backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Pressable onPress={() => goBack()} hitSlop={8} style={styles.floatingPress}>
            <Icon name="arrow-back" size={18} color={colors.text} />
          </Pressable>
        </View>
        <ErrorState message={error} onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={[styles.floatingBack, { top: insets.top + spacing.sm, backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
        <Pressable onPress={() => goBack()} hitSlop={8} style={styles.floatingPress} accessibilityLabel="Go back">
          <Icon name="arrow-back" size={18} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 52, paddingBottom: Math.max(insets.bottom, spacing.lg) + 24 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
          {items.length > 0 ? (
            <Pressable onPress={() => markAllRead()} hitSlop={6}>
              <Text style={[styles.markAll, { color: colors.primary }]}>Mark all read</Text>
            </Pressable>
          ) : null}
        </View>

        {/* The clear actions sit in their own row rather than crowding the title, so
            the destructive one is a deliberate tap instead of a near-miss on
            "Mark all read" -- the two sit at opposite ends of the same line otherwise. */}
        {items.length > 0 ? (
          <View
            style={[
              styles.clearRow,
              { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight },
            ]}
          >
            <Pressable
              onPress={confirmClearRead}
              disabled={readCount === 0}
              hitSlop={6}
              style={({ pressed }) => [
                styles.clearButton,
                pressed && readCount > 0 && { opacity: 0.6 },
                readCount === 0 && styles.clearButtonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.clearLabel,
                  { color: readCount === 0 ? colors.textMuted : colors.text },
                ]}
              >
                Clear read
              </Text>
              {readCount > 0 ? (
                <Text style={[styles.clearCount, { color: colors.textMuted }]}>{readCount}</Text>
              ) : null}
            </Pressable>

            <View style={[styles.clearDivider, { backgroundColor: colors.borderLight }]} />

            <Pressable
              onPress={confirmClearAll}
              hitSlop={6}
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
            >
              <Icon name="delete-outline" size={14} color={colors.danger} />
              <Text style={[styles.clearLabel, { color: colors.danger }]}>Clear all</Text>
            </Pressable>
          </View>
        ) : null}

        {items.length > 0 ? (
          // Stated rather than left to be discovered: the database drops the oldest once
          // the list passes the cap, and a user who cannot see that happening would
          // reasonably think notifications had been lost. Phrased as an upper bound
          // rather than a count, so it stays true for someone with three notifications
          // as well as someone sitting exactly on the cap.
          <Text style={[styles.capNote, { color: colors.textMuted }]}>
            Up to the {NOTIFICATION_LIMIT} most recent are kept. Anything older is removed automatically.
          </Text>
        ) : null}

        {items.length === 0 ? (
          <EmptyState title="No notifications" message="Order updates and offers will appear here." />
        ) : (
          <View style={styles.list}>
            {items.map((notification) => (
              <Pressable key={notification.id} onPress={() => markAsRead(notification.id)} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
                <View
                  style={[
                    styles.card,
                    { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight, opacity: notification.read ? 0.68 : 1 },
                  ]}
                >
                  <View style={[styles.statusDot, { backgroundColor: statusColor(notification.type, colors) }]} />
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeader}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {notification.title}
                      </Text>
                      <View style={[styles.statusChip, { backgroundColor: statusColor(notification.type, colors) + "1A", borderColor: statusColor(notification.type, colors) + "30" }]}>
                        <Text style={[styles.statusText, { color: statusColor(notification.type, colors) }]}>{statusLabel(notification.type)}</Text>
                      </View>
                    </View>
                    <Text style={[styles.body, { color: colors.textMuted }]}>{notification.body}</Text>
                    <Text style={[styles.time, { color: colors.textMuted }]}>{formatDateTime(notification.createdAt)}</Text>
                  </View>
                  {!notification.read ? (
                    <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {unreadCount > 0 && items.length > 0 ? (
          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            {unreadCount} unread.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  floatingBack: {
    position: "absolute",
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    boxShadow: "0px 2px 4px rgba(0,0,0,0.08)",
  },
  floatingPress: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
  container: { paddingHorizontal: spacing.lg, gap: spacing.md },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800" },
  markAll: { fontSize: 12, fontWeight: "700" },
  clearRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  clearButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm + 2,
  },
  clearButtonDisabled: { opacity: 0.55 },
  clearLabel: { fontSize: 12, fontWeight: "700" },
  clearCount: { fontSize: 11, fontWeight: "700" },
  clearDivider: { width: 1, alignSelf: "stretch" },
  capNote: { fontSize: 11, lineHeight: 15, marginTop: -spacing.xs },
  footnote: { fontSize: 11, textAlign: "center" },
  list: { gap: spacing.md },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: "flex-start",
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  cardBody: { flex: 1, gap: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  cardTitle: { fontSize: 13, fontWeight: "700", flex: 1 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.2 },
  body: { fontSize: 12, lineHeight: 16 },
  time: { fontSize: 11, marginTop: 2 },
});
