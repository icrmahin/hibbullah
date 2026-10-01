import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";

type LoadingStateProps = {
  label?: string;
};

/**
 * A spinner and a line of text.
 *
 * It used to render the brand logo at 64px above the spinner — a splash-screen gesture in
 * the middle of a list, and twice the height of the thing it was waiting for. Loading is
 * not a moment that needs branding; it needs to be small, calm and honest about what it is
 * waiting for, then get out of the way.
 */
export default function LoadingState({ label = "Loading…" }: LoadingStateProps) {
  const colors = useThemeColors();
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="small" color={colors.accent} />
      <Text style={[styles.text, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  text: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
});
