import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon, { type IconName } from "./Icon";

type SectionProps = {
  /** Section title, e.g. "Price & stock". */
  title: string;
  /** Leading Material icon — every section in the app opens the same way. */
  icon?: IconName;
  /** Right-hand slot — a count, an action, a badge. */
  action?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * The one section.
 *
 * Every screen in the app — customer, admin, auth — is `Screen` → `ScreenHeader` →
 * sections: an icon + title row, a 1px hairline, then the content on the 4px grid.
 * No bento grids, no nested boxes-in-boxes; one rhythm everywhere.
 */
export default function Section({ title, icon, action, children }: SectionProps) {
  const colors = useThemeColors();
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        {icon ? <Icon name={icon} size={16} color={colors.accent} /> : null}
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {title}
        </Text>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      <View style={[styles.rule, { backgroundColor: colors.borderSoft }]} />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
    letterSpacing: 0.1,
  },
  action: {
    alignItems: "center",
    justifyContent: "center",
  },
  rule: {
    height: 1,
  },
  body: {
    gap: spacing.md,
  },
});
