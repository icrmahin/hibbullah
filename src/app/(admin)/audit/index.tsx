/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import EmptyState from "../../../components/common/EmptyState";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useBottomInset } from "../../../hooks/useBottomInset";
import spacing from "../../../constants/spacing";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "../../../constants/typography";
import { formatDateTime } from "../../../utils/date";
import { fetchAuditEntries } from "../../../services/audit";
import { AUDIT_LOG_LIMIT } from "../../../constants/limits";
import type { AuditEntry } from "../../../types/audit";
import { diffAuditValues } from "../../../utils/auditDiff";
import { radius } from "../../../constants/sizes";

/**
 * What actually changed, for one audit entry.
 *
 * The action and the record type say that a row moved; only these lines say where it went.
 * An INSERT has no previous value and a DELETE has no new one, so each end is labelled from
 * the action rather than showing a bare arrow to nothing.
 */
function AuditChange({ entry }: { entry: AuditEntry }) {
  const colors = useThemeColors();
  const { changes, hidden } = diffAuditValues(entry.oldValue, entry.newValue);

  if (changes.length === 0) return null;
  const verb =
    entry.action === "INSERT"
      ? "set"
      : entry.action === "DELETE"
        ? "was"
        : "changed";

  return (
    <View style={[styles.changeBox, { borderTopColor: colors.borderSoft }]}>
      {changes.map((c) => (
        <Text
          key={c.field}
          style={[styles.change, { color: colors.textSecondary }]}
        >
          <Text style={[styles.changeField, { color: colors.textMuted }]}>
            {c.field}{" "}
          </Text>
          {entry.action === "INSERT" ? (
            <Text style={[styles.changeValue, { color: colors.text }]}>
              {verb} to {c.to}
            </Text>
          ) : entry.action === "DELETE" ? (
            <Text style={[styles.changeValue, { color: colors.text }]}>
              {verb} {c.from}
            </Text>
          ) : (
            <Text style={[styles.changeValue, { color: colors.text }]}>
              {c.from ?? "—"} → {c.to ?? "—"}
            </Text>
          )}
        </Text>
      ))}
      {hidden > 0 ? (
        <Text style={[styles.change, { color: colors.textMuted }]}>
          +{hidden} more
        </Text>
      ) : null}
    </View>
  );
}

export default function AuditLogScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditEntries();
      setEntries(data);
    } catch (e: any) {
      setError(e.message || "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <Screen
        header={
          <ScreenHeader
            title="Audit log"
            subtitle="Recent operational activity"
          />
        }
      >
        <LoadingState label="Loading audit log" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen
        header={
          <ScreenHeader
            title="Audit log"
            subtitle="Recent operational activity"
          />
        }
      >
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title="Audit log"
          subtitle="Recent operational activity"
        />
      }
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: bottomInset },
        ]}
      >
        {entries.length === 0 ? (
          <EmptyState
            title="No audit entries"
            message="Operational activity will appear here."
          />
        ) : (
          <>
            {/* Stated rather than left to be discovered. The database drops the oldest
                entry once the cap is passed, so without this an admin would watch rows
                vanish and reasonably conclude the log was unreliable. */}
            <Text style={[styles.note, { color: colors.textMuted }]}>
              The {AUDIT_LOG_LIMIT} most recent entries are kept. Older activity
              is removed automatically.
            </Text>
            {entries.map((entry) => (
              <View
                key={entry.id}
                style={[styles.card, { backgroundColor: colors.backgroundAlt }]}
              >
                <Text style={[styles.action, { color: colors.text }]}>
                  {entry.action} · {entry.recordType}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {entry.actorName}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {formatDateTime(entry.timestamp)}
                </Text>
                <AuditChange entry={entry} />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  note: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  action: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: -0.2,
  },
  meta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    marginTop: spacing.xs,
  },
  changeBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    // Solid `borderSoft`, theme-aware. It used to be a hardcoded `rgba(128,128,128,0.25)`,
    // a 25%-alpha grey that read as noise on the near-black dark surface.
    borderTopWidth: 1,
    gap: spacing.xxs,
  },
  change: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  changeField: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  changeValue: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
});
