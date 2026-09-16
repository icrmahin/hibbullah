import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import colors from '../../constants/colors';
import spacing from '../../constants/spacing';
import typography from '../../constants/typography';

type StatusBadgeProps = {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
};

export default function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const palette = {
    success: { background: colors.greenSoft, text: colors.success, border: '#BFE3CC', dot: colors.success },
    warning: { background: colors.amberSoft, text: colors.warning, border: '#EBD9AC', dot: colors.gold },
    danger: { background: colors.redSoft, text: colors.danger, border: '#F0C4C0', dot: colors.danger },
    info: { background: colors.primarySoft, text: colors.primary, border: '#C6DECB', dot: colors.primary },
    neutral: { background: colors.background, text: colors.textMuted, border: colors.border, dot: colors.textMuted },
  }[tone];

  return (
    <View
      style={[styles.badge, { backgroundColor: palette.background, borderColor: palette.border }]}
      accessibilityLabel={label}
      accessibilityRole="text"
    >
      {/* Dot + text so status never depends on color alone. */}
      <View style={[styles.dot, { backgroundColor: palette.dot }]} />
      <Text style={[styles.text, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: typography.label,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
