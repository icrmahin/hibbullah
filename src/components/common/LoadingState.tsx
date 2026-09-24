import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import AppLogo from "./AppLogo";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";

type LoadingStateProps = {
  label?: string;
};

export default function LoadingState({ label = "Loading…" }: LoadingStateProps) {
  const colors = useThemeColors();
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label}>
      <AppLogo size={64} />
      <ActivityIndicator size="small" color={colors.primary} />
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
    fontFamily: fontFamily.regular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
});
