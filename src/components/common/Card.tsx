import { Pressable, StyleSheet, View, type ViewProps } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";

type CardProps = ViewProps & {
  onPress?: () => void;
  pressed?: boolean;
  elevation?: "none" | "xs" | "sm" | "md";
};

/**
 * One flat surface: 6px rectangle, 1px hairline, page-to-card lightness step.
 * `elevation` is accepted and ignored — shadows are gone, kept only so call sites
 * keep working. A pressable card answers with the native ripple, clipped by
 * `overflow: hidden`; there is no scale or fade.
 */
export default function Card({
  onPress,
  pressed = false,
  elevation: _elevation,
  style,
  children,
  ...props
}: CardProps) {
  const colors = useThemeColors();
  void _elevation;

  const cardStyle = [
    styles.card,
    {
      backgroundColor: colors.backgroundAlt,
      borderColor: colors.borderLight,
    },
    pressed && styles.pressed,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        android_ripple={{ color: colors.ripple.primary, borderless: false }}
        style={[styles.pressable, { borderColor: colors.borderLight }]}
      >
        <View style={cardStyle} {...props}>
          {children}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={cardStyle} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
  },
  pressable: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.92,
  },
});
