import { StyleSheet, View } from "react-native";
import { spacing } from "../../constants/spacing";
import Dialog from "./Dialog";
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
  return (
    <Dialog visible={visible} onClose={onClose} title={title} message={message}>
      <View style={styles.actions}>
        {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} fullWidth /> : null}
        <Button title="Close" variant="ghost" onPress={onClose} fullWidth />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
