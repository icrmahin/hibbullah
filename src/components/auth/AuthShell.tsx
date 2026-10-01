import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import Screen from "../common/Screen";
import spacing from "../../constants/spacing";

/**
 * The one auth shell.
 *
 * Every unauthenticated screen — welcome, sign-in/sign-up, forgot password, reset password
 * — is this frame: `Screen` (background + safe-area insets, no header because auth keeps
 * its brand shell instead of `ScreenHeader`) → `KeyboardAvoidingView` → `ScrollView` → the
 * centered 440-wide column the form lives in.
 *
 * Two things it fixes, both from the four hand-rolled copies it replaces:
 *
 * · **One set of paddings.** The copies disagreed (`spacing.massive` on welcome,
 *   `spacing.xxl`/`spacing.lg` elsewhere), so the same brand block started at a different
 *   height on each screen. The gutter is now the app-wide `spacing.lg` with equal, generous
 *   top/bottom, and the safe-area insets come from `Screen` — the same two edges the
 *   `SafeAreaView` these copies each wrapped themselves in used to cover, without every
 *   screen writing its own.
 * · **A scroll view.** Only the keyboard-avoiding wrapper guarded the fields before, so the
 *   four-field sign-up on a small phone had nothing to fall back on once the keyboard took
 *   half the screen. `contentContainerStyle` grows so a short screen still centres, and
 *   `keyboardShouldPersistTaps="handled"` keeps the submit button tappable after a field
 *   focus is dismissed.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <Screen safeTop safeBottom>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
    alignItems: "center",
  },
  column: {
    width: "100%",
    maxWidth: 440,
    flexGrow: 1,
  },
});
