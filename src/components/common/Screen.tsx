import { StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";

type ScreenProps = ViewProps & {
  /** Apply safe area padding to the top. Default: true */
  safeTop?: boolean;
  /** Apply safe area padding to the bottom. Default: false */
  safeBottom?: boolean;
  /** Background color override. Default: surface.background */
  backgroundColor?: string;
};

export default function Screen({
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
        safeTop && { paddingTop: insets.top },
        safeBottom && { paddingBottom: insets.bottom },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
