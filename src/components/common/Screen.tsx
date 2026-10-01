import { StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../providers/ThemeProvider";

type ScreenProps = ViewProps & {
  /**
   * The screen's header — normally a `ScreenHeader`.
   *
   * When present, the header owns the top safe-area inset and the screen does not add one,
   * so the white header bar runs edge-to-edge behind the status bar instead of sitting on a
   * strip of page colour. When absent, `safeTop` applies.
   */
  header?: React.ReactNode;
  /** Apply safe-area padding to the top. Only used when there is no `header`. Default: true */
  safeTop?: boolean;
  /** Apply safe-area padding to the bottom. Default: false */
  safeBottom?: boolean;
  /** Background color override. Default: surface.background */
  backgroundColor?: string;
};

export default function Screen({
  header,
  safeTop = true,
  safeBottom = false,
  backgroundColor,
  style,
  children,
  ...props
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const bgColor = backgroundColor ?? colors.background;

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: bgColor },
        !header && safeTop && { paddingTop: insets.top },
        safeBottom && { paddingBottom: insets.bottom },
        style,
      ]}
      {...props}
    >
      {header}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
