import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius, layout } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "./Icon";

/**
 * The remaining TextInput props are accepted so a caller can reach anything the
 * bare TextInput supports (`autoFocus`, `autoCorrect`, `maxLength`, …) without
 * this component having to re-declare each one. The input itself keeps priority:
 * styling, `value` and the clear button are applied after the spread.
 */
type SearchBarProps = Omit<TextInputProps, "value" | "onChange" | "style" | "editable"> & {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

export default function SearchBar({
  value,
  onChangeText,
  placeholder = "Search products",
  onSubmit,
  onFocus,
  onBlur,
  ...props
}: SearchBarProps) {
  const colors = useThemeColors();
  const shadows = useShadows();

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: colors.backgroundAlt,
          borderColor: colors.borderLight,
          ...shadows.sm,
        },
      ]}
    >
      <Icon name="search" size={20} color={colors.textMuted} />
      <TextInput
        {...props}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        onSubmitEditing={onSubmit}
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel={props.accessibilityLabel ?? placeholder}
        style={[styles.input, { color: colors.text }]}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText("")}
          style={[styles.clearButton, { backgroundColor: colors.primarySoft }]}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Icon name="close" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    height: layout.inputHeight,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    paddingVertical: spacing.sm,
    marginLeft: spacing.sm,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});