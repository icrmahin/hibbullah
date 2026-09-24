import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Button from "./Button";

export default function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.title3,
    lineHeight: fontSize.title3 * lineHeight.normal,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.relaxed,
    textAlign: "center",
  },
});
