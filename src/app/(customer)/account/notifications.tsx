import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import EmptyState from "../../../components/common/EmptyState";
import { goBack } from "@/utils/navigation";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
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
  const { items, loading, error, reload, markAsRead, markAllRead } = useNotifications();

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
                </View>
              </Pressable>
            ))}
          </View>
        )}
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
  cardBody: { flex: 1, gap: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  cardTitle: { fontSize: 13, fontWeight: "700", flex: 1 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.2 },
  body: { fontSize: 12, lineHeight: 16 },
  time: { fontSize: 11, marginTop: 2 },
});
