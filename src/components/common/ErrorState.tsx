import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Button from "./Button";

export default function ErrorState({
  title = "Something went wrong",
  message = "Please try again.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={[styles.title, { color: colors.danger }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry ? <Button title="Retry" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    lineHeight: fontSize.footnote * lineHeight.normal,
    textAlign: "center",
  },
});
