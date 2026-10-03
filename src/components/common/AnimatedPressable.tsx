import { type ReactNode } from "react";
import { Pressable, type PressableProps, type ViewStyle } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";

type Compression = "subtle" | "standard" | "deep";

type AnimatedPressableProps = Omit<PressableProps, "style" | "children" | "android_ripple"> & {
  children: ReactNode;
  /**
   * Deprecated no-op, kept for API compatibility.
   * Press feedback is the Android-native ripple now; there is no scale to tune.
   */
  compression?: Compression;
  style?: ViewStyle | ViewStyle[];
  disabled?: boolean;
  android_ripple?: PressableProps["android_ripple"];
};

/**
 * Ripple-only pressable.
 *
 * Previously a Reanimated spring compressed the child to 0.92–0.97 on press — the last
 * "lift" in the app. Now the view answers a touch with the native Android ripple and
 * nothing else. `compression` is accepted and ignored so the 3 call sites keep working.
 */
export default function AnimatedPressable({
  children,
  compression: _comp,
  disabled = false,
  android_ripple,
  style,
  ...props
}: AnimatedPressableProps) {
  const colors = useThemeColors();
  void _comp;
  return (
    <Pressable
      {...props}
      disabled={disabled}
      android_ripple={android_ripple ?? { color: colors.ripple.primary, borderless: false }}
      style={style as PressableProps["style"]}
    >
      {children}
    </Pressable>
  );
}
