import { Modal as RNModal, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography, { fontFamily } from "../../constants/typography";
import Button from "./Button";

export default function Modal({
  visible,
  title,
  message,
  onClose,
  actionLabel,
  onAction,
}: {
  visible: boolean;
  title: string;
  message?: string;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useThemeColors();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      >
        {/*
          The card claims the responder for itself.

          This was a bare `View`, so a touch that landed on the title or the message had no
          responder between it and the backdrop's `onPress` — reading the dialog closed it.
          The dialog is a dialog: only the scrim around it should dismiss it.

          `onStartShouldSetResponder` is the right lever rather than the obvious
          `onStartShouldSetResponderCapture`. Capture runs top-down before the touch
          reaches its target, so it would also swallow the presses on the buttons below.
          This one runs bottom-up from the touched view, which means the card wins for a
          touch on its own surface and the buttons still win for a touch on themselves,
          because a deeper view is asked first.
        */}
        <View
          onStartShouldSetResponder={() => true}
          style={[styles.card, { backgroundColor: colors.backgroundAlt }]}
        >
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            {title}
          </Text>
          {message ? (
            <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
          ) : null}
          <View style={styles.actions}>
            {actionLabel && onAction ? (
              <Button title={actionLabel} onPress={onAction} fullWidth />
            ) : null}
            <Button title="Close" variant="ghost" onPress={onClose} fullWidth />
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
    padding: spacing.xl,
  },
  card: {
    borderRadius: sizes.borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { fontFamily: fontFamily.soraSemiBold, fontSize: typography.title2 },
  message: { fontSize: typography.body, lineHeight: 24 },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});