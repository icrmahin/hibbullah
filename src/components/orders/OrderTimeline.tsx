import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { formatDateTime, formatRelativeTime } from "../../utils/date";
import { timelineStepLabel } from "../../utils/displayLabels";

export type TimelineStep = {
  label: string;
  time: string;
  note?: string;
};

/**
 * Order tracking as a vertical stepper, shared by the customer and admin
 * detail screens so both read identically.
 *
 * Steps render in stored order (oldest first) with the latest step
 * highlighted — that is the one a tracking eye looks for. The rail is a
 * single absolute line behind the dots, so rows of any height stay connected
 * without per-row measurement. Times read relative ("2h ago") with the exact
 * timestamp beside them; an unreadable timestamp renders "—" via the shared
 * date guards, never a crash.
 */
export default function OrderTimeline({ steps }: { steps: TimelineStep[] }) {
  const colors = useThemeColors();

  if (!steps || steps.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textMuted }]}>
        No timeline events yet.
      </Text>
    );
  }

  const lastIndex = steps.length - 1;

  return (
    <View
      style={styles.list}
      accessibilityRole="list"
      accessibilityLabel={`Order timeline, ${steps.length} events`}
    >
      {steps.map((step, index) => {
        const current = index === lastIndex;
        return (
          <View
            key={`${step.label}-${step.time}-${index}`}
            style={styles.row}
            accessibilityLabel={`${timelineStepLabel(step.label)}, ${formatRelativeTime(step.time)}`}
          >
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: current ? colors.accent : colors.borderLight,
                    borderColor: current ? colors.accent : colors.border,
                  },
                ]}
              />
              {index < lastIndex ? (
                <View style={[styles.line, { backgroundColor: colors.borderLight }]} />
              ) : null}
            </View>
            <View style={styles.content}>
              <Text
                style={[
                  styles.label,
                  { color: current ? colors.text : colors.textSecondary },
                  current && styles.labelCurrent,
                ]}
              >
                {timelineStepLabel(step.label)}
              </Text>
              <Text style={[styles.time, { color: colors.textMuted }]}>
                {formatRelativeTime(step.time)} · {formatDateTime(step.time)}
              </Text>
              {step.note ? (
                <Text style={[styles.note, { color: colors.textMuted }]}>{step.note}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
  },
  rail: {
    width: spacing.xl,
    alignItems: "center",
    paddingTop: spacing.xs,
  },
  dot: {
    width: spacing.md,
    height: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  line: {
    width: spacing.xxs,
    flex: 1,
    marginTop: spacing.xxs,
  },
  content: {
    flex: 1,
    gap: spacing.xxs,
    paddingBottom: spacing.sm,
  },
  label: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  labelCurrent: {
    fontFamily: fontFamily.pjsSemiBold,
  },
  time: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  note: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  empty: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
});
