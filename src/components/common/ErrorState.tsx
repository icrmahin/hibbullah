import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Button from "./Button";
import Icon from "./Icon";

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
      <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
        <Icon name="error-outline" size={22} color={colors.danger} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry ? <Button title="Retry" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

/**
 * The icon well is a circle, so its corner is derived from its size rather than coming
 * from the 2/6/8 radius scale — the one shape outside it, same as an avatar.
 */
const ICON_WELL_SIZE = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: ICON_WELL_SIZE,
    height: ICON_WELL_SIZE,
    borderRadius: ICON_WELL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  message: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.relaxed,
    textAlign: "center",
  },
});
