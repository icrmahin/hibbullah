import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../providers/ThemeProvider";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import Icon from "./Icon";

type HeaderProps = {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  onBack?: () => void;
};

export default function Header({
  title,
  subtitle,
  rightAction,
  onBack,
}: HeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.md,
          backgroundColor: colors.backgroundAlt,
        },
      ]}
    >
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Icon name="arrow-back" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
        <View style={styles.titleArea}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightAction ? <View style={styles.action}>{rightAction}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  backButton: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: sizes.borderRadius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  titleArea: { flex: 1 },
  title: {
    fontSize: typography.title3,
    fontWeight: "600",
    letterSpacing: typography.letterSpacing.tight,
  },
  subtitle: {
    fontSize: typography.caption1,
    marginTop: spacing.xxs,
  },
  action: { alignItems: "center", justifyContent: "center" },
});
