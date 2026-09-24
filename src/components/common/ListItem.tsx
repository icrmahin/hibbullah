/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable by design */
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from "react-native-reanimated";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { layout } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { springConfigs } from "../../lib/motion";
import Icon from "./Icon";
import type { IconName } from "./Icon";

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
  const shadows = useShadows();
  const reducedMotion = useReducedMotion();

  const padding = compact
    ? { paddingVertical: spacing.sm, paddingHorizontal: spacing.md }
    : { paddingVertical: spacing.md, paddingHorizontal: spacing.lg };

  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (reducedMotion) return;
    scale.value = withSpring(0.98, springConfigs.snap);
  };

  const handlePressOut = () => {
    if (reducedMotion) return;
    scale.value = withSpring(1, springConfigs.snap);
  };

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
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[animatedStyle, { backgroundColor: colors.backgroundAlt, ...shadows.xs }]}>{content}</Animated.View>
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
    borderRadius: 10,
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