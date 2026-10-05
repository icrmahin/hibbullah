import type { ReactNode } from "react";
import { Modal as RNModal, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "./Icon";
import type { IconName } from "./Icon";

export type DialogIcon = {
  name: IconName;
  /** Solid soft circle behind the glyph. Danger for irreversible confirms, info otherwise. */
  tone: "info" | "danger";
};

type DialogProps = {
  visible: boolean;
  /** Dismiss: backdrop tap and the system back button. Content taps never dismiss. */
  onClose: () => void;
  title: string;
  message?: string;
  icon?: DialogIcon;
  children: ReactNode;
};

/**
 * The one dialog shell. `Modal`, `ConfirmDialog`, and the select sheets all
 * draw the same overlay and the same card: `overlay` scrim, 6px rectangle,
 * 1px hairline, `lg` padding, `md` gaps, `title3` title, `body` message,
 * capped at 420px so it stays a dialog on a tablet.
 *
 * Two sanctioned action layouts, chosen by the caller, not the shell:
 * stacked full-width buttons (`Modal`) or a side-by-side row
 * (`ConfirmDialog`). The card claims the touch responder for itself, so a
 * tap on the title or message is never a dismiss — only the scrim around
 * the card dismisses, matching every native dialog.
 */
export default function Dialog({ visible, onClose, title, message, icon, children }: DialogProps) {
  const colors = useThemeColors();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <View onStartShouldSetResponder={() => true} style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          {icon ? (
            <View style={styles.header}>
              <View style={[styles.iconCircle, { backgroundColor: icon.tone === "danger" ? colors.dangerSoft : colors.infoSoft }]}>
                <Icon name={icon.name} size={20} color={icon.tone === "danger" ? colors.danger : colors.accent} />
              </View>
              <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
                {title}
              </Text>
            </View>
          ) : (
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              {title}
            </Text>
          )}
          {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
          {children}
        </View>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.title3,
    lineHeight: fontSize.title3 * lineHeight.tight,
    flexShrink: 1,
  },
  message: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.normal,
  },
});
