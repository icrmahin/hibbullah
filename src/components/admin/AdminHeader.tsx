import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import colors from '../../constants/colors';
import spacing from '../../constants/spacing';
import typography from '../../constants/typography';

type AdminHeaderProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export default function AdminHeader({ title, subtitle, action }: AdminHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {/* Fixed eyebrow keeps brand + role visible without adding new controls. */}
        <Text style={styles.eyebrow}>Hibbullah · Admin</Text>
        <View style={styles.titleRow}>
          <View style={styles.activeDot} />
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  title: {
    color: colors.text,
    // Compact industrial screen title: capped at 24 per spec, not oversized.
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.caption,
    marginTop: 2,
  },
});
