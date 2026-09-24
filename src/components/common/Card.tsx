/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable by design */
import { Pressable, StyleSheet, type ViewProps } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from "react-native-reanimated";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { springConfigs, compression as compressionValues } from "../../lib/motion";

type CardProps = ViewProps & {
  onPress?: () => void;
  pressed?: boolean;
  elevation?: "none" | "xs" | "sm" | "md";
};

export default function Card({
  onPress,
  pressed = false,
  elevation = "sm",
  style,
  children,
  ...props
}: CardProps) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const shadowStyle = shadows[elevation];
  const reducedMotion = useReducedMotion();

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    if (reducedMotion) return;
    scale.value = withSpring(compressionValues.subtle, springConfigs.card);
    opacity.value = withSpring(0.92, springConfigs.card);
  };

  const handlePressOut = () => {
    if (reducedMotion) return;
    scale.value = withSpring(1, springConfigs.card);
    opacity.value = withSpring(1, springConfigs.card);
  };

  const cardStyles = [
    styles.card,
    {
      backgroundColor: colors.backgroundAlt,
      borderColor: colors.borderLight,
    },
    shadowStyle,
    pressed && styles.pressed,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[cardStyles, animatedStyle]} {...props}>
          {children}
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Animated.View style={[cardStyles, animatedStyle]} {...props}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.92,
  },
});