/**
 * A cross-platform confirmation dialog.
 *
 * This exists because `Alert.alert` is a no-op on web. react-native-web ships its entire
 * Alert implementation as `class Alert { static alert() {} }` — an empty body. On web it
 * shows nothing, and, worse, the `onPress` handler on each button never runs. Every
 * destructive action gated behind it therefore did nothing at all on web while looking
 * completely correct on a phone, which is why "Clear all notifications" and the address
 * bin icon were both reported as broken while the database layer was provably correct.
 *
 * `Modal` is used as the shell because react-native-web *does* implement it properly
 * (with a focus trap and portal), so this works on web and native from one component.
 */
import { Modal as RNModal, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import Button from "./Button";
import Icon from "./Icon";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the danger palette. Use for anything irreversible. */
  destructive?: boolean;
};

type ConfirmDialogProps = ConfirmOptions & {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const colors = useThemeColors();
  // Ink for the dialog's title and its icon glyph. The circle behind the icon is the
  // palette's solid `dangerSoft`/`infoSoft`, both of which are contrast-checked against the
  // status colour they carry — which is what replaced the `accent + "22"` alpha wash this
  // used to sit on, and what makes `accent` the right ink here rather than merely a
  // close-enough one.
  const accent = destructive ? colors.danger : colors.accent;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      {/* Tapping the backdrop cancels, matching every native confirm dialog. */}
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onCancel}>
        {/*
          The card claims the responder, so a tap on the title or the message is not a
          cancel.

          This was a `Pressable` whose only job was `e.stopPropagation()` — a full-card
          touch target that did nothing, which is also what a screen reader announces as a
          pressable alert. It was replaced with the same `onStartShouldSetResponder` guard
          `Modal.tsx` uses, which answers the same question ("is this touch mine?")
          declaratively, needs no synthetic event, and leaves no dead target behind. The
          Cancel and Delete buttons below are deeper, so they are asked first and still
          win for a touch on themselves.
        */}
        <View
          onStartShouldSetResponder={() => true}
          accessibilityRole="alert"
          accessibilityLabel={title}
          style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}
        >
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: destructive ? colors.dangerSoft : colors.infoSoft }]}>
              <Icon name={destructive ? "error-outline" : "help-outline"} size={20} color={accent} />
            </View>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              {title}
            </Text>
          </View>

          {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}

          <View style={styles.actions}>
            <Button
              title={cancelLabel}
              variant="ghost"
              onPress={onCancel}
              fullWidth
              style={styles.action}
            />
            <Button
              title={confirmLabel}
              variant={destructive ? "danger" : "primary"}
              onPress={onConfirm}
              fullWidth
              style={styles.action}
            />
          </View>
        </View>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.title3,
    flexShrink: 1,
  },
  message: { fontSize: typography.body, lineHeight: 24 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
});
