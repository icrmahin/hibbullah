import { Modal as RNModal, Pressable, StyleSheet, Text, View } from "react-native";
import colors from "../../constants/colors";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
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
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
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
    backgroundColor: colors.overlay,
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: sizes.borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { color: colors.text, fontSize: typography.title2, fontWeight: "600" },
  message: { color: colors.textSecondary, fontSize: typography.body, lineHeight: 24 },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
