import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius, layout, opacity as opacityToken } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "./Icon";

type Option = {
  label: string;
  value: string;
};

type SelectProps = {
  label?: string;
  value?: string;
  options: Option[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
  style?: ViewStyle;
};

export default function Select({
  label,
  value,
  options,
  placeholder = "Select…",
  error,
  disabled = false,
  onSelect,
  style,
}: SelectProps) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        android_ripple={{ color: colors.ripple.primary, borderless: false }}
        style={[
          styles.trigger,
          { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight },
          !!error && { borderColor: colors.danger },
          disabled && styles.triggerDisabled,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        accessibilityLabel={label || placeholder}
      >
        <Text
          style={[styles.triggerText, !selected && styles.placeholder, { color: selected ? colors.text : colors.textMuted }]}
          numberOfLines={1}
        >
          {selected?.label || placeholder}
        </Text>
        <Icon name="expand-more" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{label || placeholder}</Text>
            {options.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => {
                  onSelect(opt.value);
                  setOpen(false);
                }}
                style={[styles.option, opt.value === value && styles.optionSelected, { backgroundColor: opt.value === value ? colors.primarySoft : "transparent" }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: opt.value === value }}
              >
                <Text style={[styles.optionText, opt.value === value && styles.optionTextSelected, { color: opt.value === value ? colors.accent : colors.text }]}>
                  {opt.label}
                </Text>
                {opt.value === value && (
                  <Icon name="check" size={18} color={colors.accent} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySmall,
    lineHeight: fontSize.bodySmall * lineHeight.normal,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: layout.inputHeight,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    overflow: "hidden",
  },
  triggerDisabled: { opacity: opacityToken.disabled },
  triggerText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.normal,
  },
  placeholder: { },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  sheetTitle: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.title3,
    lineHeight: fontSize.title3 * lineHeight.tight,
    marginBottom: spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minHeight: layout.touch,
  },
  optionSelected: { },
  optionText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.normal,
  },
  optionTextSelected: { fontFamily: fontFamily.semiBold },
});