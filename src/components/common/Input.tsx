import { useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius, layout, opacity as opacityToken } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  containerStyle?: ViewStyle;
};

export default function Input({
  label,
  error,
  hint,
  prefix,
  suffix,
  containerStyle,
  ...props
}: InputProps) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <View
        style={[
          styles.inputRow,
          {
            borderColor: focused ? colors.primary : error ? colors.danger : colors.border,
            backgroundColor: colors.backgroundAlt,
            ...shadows.xs,
          },
          focused && styles.inputRowFocused,
          !!error && styles.inputRowError,
          props.editable === false && styles.inputRowDisabled,
        ]}
      >
        {prefix ? <View style={styles.adornment}>{prefix}</View> : null}
        <TextInput
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[
            styles.input,
            { color: colors.text },
            props.multiline && styles.textArea,
            !!prefix && styles.inputWithPrefix,
            !!suffix && styles.inputWithSuffix,
            props.style,
          ]}
          placeholderTextColor={colors.textMuted}
        />
        {suffix ? <View style={styles.adornment}>{suffix}</View> : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: layout.inputHeight,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  inputRowFocused: { borderWidth: 2 },
  inputRowError: {},
  inputRowDisabled: { opacity: opacityToken.disabled },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.normal,
    paddingHorizontal: spacing.lg,
    minHeight: layout.inputHeight,
  },
  inputWithPrefix: { paddingLeft: spacing.xs },
  inputWithSuffix: { paddingRight: spacing.xs },
  textArea: {
    minHeight: 120,
    borderRadius: radius.xl,
    textAlignVertical: "top",
    paddingTop: spacing.lg,
  },
  adornment: {
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
});