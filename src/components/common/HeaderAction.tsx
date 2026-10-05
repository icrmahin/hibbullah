import { Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "./Icon";
import type { IconName } from "./Icon";

type HeaderActionProps = {
  label: string;
  onPress: () => void;
  /** Leading glyph. Omitted for text-only actions like "Adjust". */
  icon?: IconName;
  /** `primary`: solid fill for the main creation action. `soft`: quiet tonal pill. */
  tone?: "primary" | "soft";
  accessibilityLabel?: string;
};

/**
 * The one header action: a compact pill that sits inside `ScreenHeader`,
 * never a full-height Button (which sat proud of the 44px header row).
 * Primary is the solid creation action (Add product / Add banner);
 * soft is the tonal variant (Adjust stock). Same height, same padding,
 * same type, ripple-only press.
 */
export default function HeaderAction({ label, onPress, icon, tone = "primary", accessibilityLabel }: HeaderActionProps) {
  const colors = useThemeColors();
  const primary = tone === "primary";

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: primary ? colors.ripple.onPrimary : colors.ripple.primary, borderless: false }}
      style={[
        styles.pill,
        { backgroundColor: primary ? colors.primary : colors.primarySoft },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon ? <Icon name={icon} size={16} color={primary ? colors.textInverse : colors.accent} /> : null}
      <Text style={[styles.text, { color: primary ? colors.textInverse : colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  text: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
});
