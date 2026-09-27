import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import Button from "./Button";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";

type Props = {
  children: React.ReactNode;
  /** Shown instead of the default copy when a section is known to be risky. */
  label?: string;
};

type State = { error: Error | null };

/**
 * Catches render errors anywhere below it and shows a recoverable screen.
 *
 * Without this, a single throw during render takes the whole process down. That is not
 * a theoretical concern here: `Intl.DateTimeFormat.format()` throws on an invalid date,
 * the `orders.timeline` jsonb holds Postgres-format timestamps that Hermes refuses to
 * parse, and opening an order therefore closed the app with no message and no way back.
 * A red box in a dev build is not a recovery strategy.
 *
 * It is a class component because that is the only way React offers to catch a render
 * error. The presentation is split out into `ErrorScreen` so it can use the theme hook —
 * a class cannot.
 *
 * Deliberately not logged to a service: there is no error reporting set up, and a
 * silent-but-surviving failure is better than one that reaches a user's phone bill.
 */
export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Kept deliberately: this is the one place a render error becomes visible in a
    // release build, where there is no red box and no Metro console.
    console.error("[AppErrorBoundary]", this.props.label ?? "render", error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorScreen error={error} onRetry={this.reset} />;
  }
}

function ErrorScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const colors = useThemeColors();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            This screen could not be displayed. The rest of the app still works — go back,
            or try again.
          </Text>
          <View style={[styles.detail, { backgroundColor: colors.background, borderColor: colors.borderSoft }]}>
            <Text style={[styles.detailText, { color: colors.textMuted }]}>{error.message}</Text>
          </View>
          <Button title="Try again" onPress={onRetry} fullWidth />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.title3,
    lineHeight: fontSize.title3 * lineHeight.tight,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySmall,
    lineHeight: fontSize.bodySmall * lineHeight.normal,
  },
  detail: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  detailText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
});
