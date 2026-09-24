import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius, layout } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";

type Tab = {
  key: string;
  label: string;
};

type TabsProps = {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
  /** Full-width tabs evenly distributed. Default: false */
  fullWidth?: boolean;
  style?: ViewStyle;
};

export default function Tabs({ tabs, activeKey, onChange, fullWidth = false, style }: TabsProps) {
  const colors = useThemeColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.container, fullWidth && styles.fullWidth, style]}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[
              styles.tab,
              active && styles.tabActive,
              fullWidth && styles.tabFull,
              {
                backgroundColor: active ? colors.primary : colors.backgroundAlt,
                borderColor: active ? colors.primary : colors.border,
              },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[
              styles.label,
              active && styles.labelActive,
              { color: active ? colors.white : colors.textMuted },
            ]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: layout.controlHeight,
    alignItems: "center",
  },
  fullWidth: { gap: 0, paddingHorizontal: 0 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    height: layout.controlHeight,
    borderRadius: radius.pill,
    gap: spacing.xs,
    borderWidth: 1,
  },
  tabFull: { flex: 1 },
  tabActive: {},
  label: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  labelActive: {
    fontFamily: fontFamily.semiBold,
  },
});