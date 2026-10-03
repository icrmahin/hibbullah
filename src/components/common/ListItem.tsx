import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { layout, radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "./Icon";

type ListItemProps = {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  divider?: boolean;
  compact?: boolean;
  style?: ViewStyle;
};

/**
 * One row: 44px touch target, 6px rectangle, hairline divider when stacked.
 * Press feedback is the native ripple, clipped by `overflow: hidden` — no scale.
 */
export default function ListItem({
  title,
  subtitle,
  left,
  right,
  onPress,
  divider = false,
  compact = false,
  style,
}: ListItemProps) {
  const colors = useThemeColors();

  const padding = compact
    ? { paddingVertical: spacing.sm, paddingHorizontal: spacing.md }
    : { paddingVertical: spacing.md, paddingHorizontal: spacing.lg };

  const content = (
    <View
      style={[
        styles.row,
        padding,
        divider && { borderTopWidth: 1, borderTopColor: colors.borderLight },
        style,
      ]}
    >
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? (
        <View style={styles.right}>{right}</View>
      ) : onPress ? (
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        android_ripple={{ color: colors.ripple.primary, borderless: false }}
        style={[styles.pressable, { backgroundColor: colors.backgroundAlt }]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: layout.touch,
    borderRadius: radius.md,
  },
  pressable: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  left: { flexShrink: 0 },
  content: { flex: 1, gap: 2 },
  right: { flexShrink: 0 },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.normal,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
});
