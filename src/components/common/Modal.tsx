import { Modal as RNModal, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
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
  const colors = useThemeColors();
  const shadows = useShadows();

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
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, ...shadows.xl }]}>
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
  title: { fontSize: typography.title2, fontWeight: "600" },
  message: { fontSize: typography.body, lineHeight: 24 },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});