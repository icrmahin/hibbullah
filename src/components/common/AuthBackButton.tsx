/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable by design */
import { Pressable, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { ArrowLeft } from "lucide-react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { springConfigs, compression } from "../../lib/motion";

type AuthBackButtonProps = {
  onPress: () => void;
};

export default function AuthBackButton({ onPress }: AuthBackButtonProps) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (reducedMotion) return;
    scale.value = withSpring(compression.standard, springConfigs.bouncy);
  };

  const handlePressOut = () => {
    if (reducedMotion) return;
    scale.value = withSpring(1, springConfigs.bouncy);
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      style={styles.positioner}
    >
      <Animated.View
        style={[
          styles.fab,
          { backgroundColor: colors.primary, ...shadows.md },
          animatedStyle,
        ]}
      >
        <ArrowLeft size={24} color={colors.white} strokeWidth={2.4} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: "absolute",
    right: spacing.xxl,
    bottom: spacing.xxl,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});