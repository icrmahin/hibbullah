import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import Icon from "./Icon";

type SoftHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  compact?: boolean;
};

export default function SoftHeader({ title, subtitle, onBack, rightAction, compact }: SoftHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const shadows = useShadows();

  return (
    <View
      style={[
        styles.island,
        {
          marginTop: insets.top + spacing.sm,
          backgroundColor: colors.backgroundAlt,
          borderColor: colors.borderSoft,
          ...shadows.sm,
        },
        compact && styles.compact,
      ]}
    >
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={[
              styles.backButton,
              { backgroundColor: colors.background, borderColor: colors.borderSoft },
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Icon name="arrow-back" size={18} color={colors.text} />
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
  island: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg, // 16 feather
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    // floating pill - no full width, soft shadow feather
  },
  compact: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 38,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleArea: { flex: 1, gap: 1 },
  title: {
    fontFamily: "Sora_600SemiBold",
    fontSize: typography.subhead,
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  subtitle: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: typography.caption,
    lineHeight: 14,
  },
  action: { alignItems: "center", justifyContent: "center" },
});
