import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../providers/ThemeProvider";
import spacing from "../../constants/spacing";
import { radius } from "../../constants/sizes";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "./Icon";

/**
 * The one header.
 *
 * Every screen in the app renders this — customer, admin and detail screens alike — and it
 * is deliberately boring: a white bar, one title, an optional back control on the left and
 * an optional action on the right. The seven previous header variants (two shared
 * components, a hand-rolled home island, three floating back buttons and a set of
 * in-content bold titles) disagreed on title size (15/16/18/20px), on back placement
 * (left and right), on typeface (system font, Sora, hardcoded font-name strings) and on
 * who owned the status-bar inset — which is why a screen with both a `SafeAreaView` and a
 * header showed the inset twice and started its content ~100px down on a notched phone.
 *
 * The inset rule is now single-owner: when a screen passes a header to `Screen`, the header
 * pads for the top inset and the screen does not. A screen with no header lets `Screen`
 * do it instead.
 *
 * Structure:  `←  Screen title                    action`
 */
type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Back control. Omit on root/tab screens. */
  onBack?: () => void;
  /** Right-hand slot — an icon button, a text action, a count. */
  action?: React.ReactNode;
  /**
   * Replaces the back slot with custom content (the brand lockup on home). Ignored when
   * `onBack` is set: a screen never has both.
   */
  leading?: React.ReactNode;
};

export default function ScreenHeader({ title, subtitle, onBack, action, leading }: ScreenHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        { backgroundColor: colors.backgroundAlt, paddingTop: insets.top + spacing.xs },
      ]}
    >
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            android_ripple={{ color: colors.ripple.primary, borderless: false }}
            style={styles.back}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Icon name="arrow-back" size={20} color={colors.text} />
          </Pressable>
        ) : leading ? (
          <View style={styles.leading}>{leading}</View>
        ) : null}

        <View style={styles.titleArea}>
          {title ? (
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  back: {
    width: 36,
    height: 36,
    marginLeft: -6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    overflow: "hidden",
  },
  leading: {
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -4,
  },
  titleArea: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.tight + 4,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal + 2,
  },
  action: {
    alignItems: "center",
    justifyContent: "center",
  },
});
