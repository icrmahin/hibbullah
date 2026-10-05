import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useState } from "react";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import EmptyState from "../../../components/common/EmptyState";
import StatusBadge from "../../../components/common/StatusBadge";
import { goBack } from "@/utils/navigation";
import spacing from "../../../constants/spacing";
import { NOTIFICATION_LIMIT } from "../../../constants/limits";
import { useNotifications } from "../../../hooks/useNotifications";
import { useConfirm } from "../../../hooks/useConfirm";
import { useBottomInset } from "../../../hooks/useBottomInset";
import ConfirmDialog from "../../../components/common/ConfirmDialog";
import { normalizeError } from "../../../utils/errorHandling";
import { formatDateTime } from "../../../utils/date";
import Icon from "../../../components/common/Icon";
import type { NotificationItem } from "../../../types/notification";
import { opacity, radius } from "../../../constants/sizes";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";

/**
 * Each notification type maps to a `StatusBadge` tone and keeps the label it has always
 * shown. The chip used to be drawn here — an ink, a `*Soft` wash and a `*Border` hairline
 * computed per call site — which is exactly what `StatusBadge` is for. The old ink for
 * `warning` was also a hard-coded `#EAB308`, a yellow unrelated to either palette.
 */
const STATUS: Record<
  NotificationItem["type"],
  { tone: "success" | "warning" | "danger" | "info"; label: string }
> = {
  alert: { tone: "danger", label: "Urgent" },
  warning: { tone: "warning", label: "Attention" },
  success: { tone: "success", label: "Done" },
  info: { tone: "info", label: "Info" },
};

export default function CustomerNotificationsScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { items, loading, error, reload, unreadCount, readCount, markAsRead, markAllRead, clearAll, clearRead } =
    useNotifications();
  const { confirm, confirmDialogProps } = useConfirm();
  const [actionError, setActionError] = useState<string | null>(null);

  // Destructive and irreversible, so both are confirmed before they run. `clearRead` is
  // the safer of the two and is offered first, which matches the common case: someone
  // tidying up usually wants the things they have not dealt with yet to survive.
  //
  // These used to be `Alert.alert(..., [{ onPress: () => void clearAll() }])`, which is
  // why "Clear all" did nothing on web: react-native-web's Alert is `static alert() {}`,
  // so the button's onPress never ran. The `void` was a second, independent problem —
  // it discarded the rejection, so even a genuinely failed clear was invisible. Both are
  // gone: the work now runs after an await inside a try/catch that reports the failure.
  const handleClearAll = async () => {
    setActionError(null);
    const ok = await confirm({
      title: "Clear all notifications?",
      message: `This permanently removes all ${items.length} of your notifications. It cannot be undone.`,
      confirmLabel: "Clear all",
      destructive: true,
    });
    if (!ok) return;
    try {
      await clearAll();
    } catch (e) {
      setActionError(normalizeError(e).message);
    }
  };

  const handleClearRead = async () => {
    setActionError(null);
    const ok = await confirm({
      title: "Clear read notifications?",
      message: `This permanently removes ${readCount} notification${readCount === 1 ? "" : "s"} you have already read. Anything unread is kept.`,
      confirmLabel: "Clear",
      destructive: true,
    });
    if (!ok) return;
    try {
      await clearRead();
    } catch (e) {
      setActionError(normalizeError(e).message);
    }
  };

  const handleMarkAllRead = async () => {
    setActionError(null);
    try {
      await markAllRead();
    } catch (e) {
      setActionError(normalizeError(e).message);
    }
  };

  const handleMarkRead = async (id: string) => {
    setActionError(null);
    try {
      await markAsRead(id);
    } catch (e) {
      setActionError(normalizeError(e).message);
    }
  };

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Notifications" onBack={goBack} />}>
        <LoadingState label="Loading notifications" />
        <ConfirmDialog {...confirmDialogProps} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Notifications" onBack={goBack} />}>
        <ErrorState message={error} onRetry={reload} />
        <ConfirmDialog {...confirmDialogProps} />
      </Screen>
    );
  }

  const header = (
    <ScreenHeader
      title="Notifications"
      onBack={goBack}
      action={
        items.length > 0 ? (
          <Pressable
            onPress={handleMarkAllRead}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
          >
            <Text style={[styles.markAll, { color: colors.accent }]}>Mark all read</Text>
          </Pressable>
        ) : undefined
      }
    />
  );

  return (
    <Screen header={header}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        {/* The clear actions sit in their own row rather than crowding the header, so
            the destructive one is a deliberate tap instead of a near-miss on
            "Mark all read" — the two sit at opposite ends of the same line otherwise. */}
        {items.length > 0 ? (
          <View style={[styles.clearRow, { backgroundColor: colors.backgroundAlt }]}>
            <Pressable
              onPress={handleClearRead}
              disabled={readCount === 0}
              hitSlop={6}
              style={({ pressed }) => [
                styles.clearButton,
                pressed && readCount > 0 && { opacity: opacity.pressed },
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

            <View style={[styles.clearDivider, { backgroundColor: colors.borderSoft }]} />

            <Pressable
              onPress={handleClearAll}
              hitSlop={6}
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: opacity.pressed }]}
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
          <EmptyState
            title="No notifications"
            message="Order updates and offers will appear here."
            icon="notifications"
          />
        ) : (
          <View style={styles.list}>
            {items.map((notification) => (
              <Pressable
                key={notification.id}
                onPress={() => handleMarkRead(notification.id)}
                android_ripple={{ color: colors.ripple.primary, borderless: false }}
                style={{ borderRadius: radius.lg, overflow: "hidden" }}
                accessibilityRole="button"
                accessibilityLabel={notification.title}
              >
                <View
                  style={[
                    styles.card,
                    { backgroundColor: colors.backgroundAlt, opacity: notification.read ? 0.68 : 1 },
                  ]}
                >
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeader}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {notification.title}
                      </Text>
                      <StatusBadge
                        label={STATUS[notification.type].label}
                        tone={STATUS[notification.type].tone}
                      />
                    </View>
                    <Text style={[styles.body, { color: colors.textMuted }]}>{notification.body}</Text>
                    <Text style={[styles.time, { color: colors.textMuted }]}>{formatDateTime(notification.createdAt)}</Text>
                  </View>
                  {!notification.read ? (
                    /* "Unread" is a state, not an action, so the dot is neutral ink rather
                       than an accent fill. Near-black in light, near-white in dark. */
                    <View style={[styles.unreadDot, { backgroundColor: colors.text }]} />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {actionError ? (
          <Text style={[styles.actionError, { color: colors.danger }]} accessibilityRole="alert">
            {actionError}
          </Text>
        ) : null}

        {unreadCount > 0 && items.length > 0 ? (
          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            {unreadCount} unread.
          </Text>
        ) : null}
      </ScrollView>
      <ConfirmDialog {...confirmDialogProps} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  markAll: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  actionError: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
  // One white row holding two actions — a control group, so it takes the control radius
  // and the two halves are split by a hairline divider rather than a border around it.
  clearRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    overflow: "hidden",
  },
  clearButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  clearButtonDisabled: { opacity: opacity.disabled },
  clearLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  clearCount: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.tight,
  },
  clearDivider: { width: 1, alignSelf: "stretch" },
  capNote: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: -spacing.xs,
  },
  footnote: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
  list: { gap: spacing.md },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "flex-start",
  },
  unreadDot: { width: 8, height: 8, borderRadius: radius.pill, marginTop: 6 },
  cardBody: { flex: 1, gap: spacing.xs },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  body: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  time: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    marginTop: spacing.xxs,
  },
});
