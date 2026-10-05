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
 * `Dialog` is the shell (it uses the RN `Modal`, which react-native-web *does* implement
 * properly with a focus trap and portal), so this works on web and native from one
 * component. This file owns only the confirm/cancel semantics on top of it.
 */
import { StyleSheet, View } from "react-native";
import { spacing } from "../../constants/spacing";
import Dialog from "./Dialog";
import Button from "./Button";

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
  return (
    <Dialog
      visible={visible}
      onClose={onCancel}
      title={title}
      message={message}
      icon={{ name: destructive ? "error-outline" : "help-outline", tone: destructive ? "danger" : "info" }}
    >
      <View style={styles.actions}>
        <Button title={cancelLabel} variant="ghost" onPress={onCancel} fullWidth style={styles.action} />
        <Button
          title={confirmLabel}
          variant={destructive ? "danger" : "primary"}
          onPress={onConfirm}
          fullWidth
          style={styles.action}
        />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
});
