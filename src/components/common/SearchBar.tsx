import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
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
  /**
   * Turn the whole bar into a button that opens a search screen elsewhere.
   *
   * This branch renders no `TextInput` at all, and that is the entire point. It is not a
   * style preference; it is the third attempt at this, and the first two were both wrong
   * in a way that only a device could show:
   *
   *   1. The caller set `readOnly` on the input and put `onPressIn` on it. React Native
   *      resolves `readOnly` to `editable={false}` (`TextInput.js:928`), and a non-editable
   *      TextInput is not a touch responder, so the handler never fired and the bar was
   *      simply dead. Nothing threw, no typecheck failed, no test failed.
   *   2. A `Pressable` was wrapped around the bar and the input was taken out of the touch
   *      chain with `pointerEvents="none"`. On a device that left the icon tappable and the
   *      rest of the bar inert: the input's own bounds were being resolved as the touch
   *      target while the responder negotiation around it depended on how the platform
   *      dispatched a focusable text field. A tap on the text did nothing; a tap on the
   *      magnifier went through.
   *
   * Both failures come from the same root: a `TextInput` in the tree is a second, competing
   * claim on the touch, and whether it wins is a platform detail. So when the bar is a
   * button, the bar is a `Pressable` with the field's own styles on it and a `Text` showing
   * the placeholder. One view, one responder, no `pointerEvents` trick, no `editable`
   * subtlety, and no keyboard to flash up for the moment it takes to navigate.
   *
   * It is visually identical — same pill, same height, same icon, same placeholder text in
   * the same muted colour and the same type metrics — and it is now honest about what it is
   * to a screen reader too: a search control, not an editable field that happens not to be
   * editable.
   */
  onPress?: () => void;
};

export default function SearchBar({
  value,
  onChangeText,
  placeholder = "Search products",
  onSubmit,
  onFocus,
  onBlur,
  onPress,
  ...props
}: SearchBarProps) {
  const colors = useThemeColors();

  // A button, not a field. Returned before the TextInput below is ever created — see the
  // note on `onPress` for why that ordering is the fix and not a detail.
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: colors.ripple.primary, borderless: false }}
        accessibilityRole="search"
        accessibilityLabel={props.accessibilityLabel ?? placeholder}
        // The field's own styles sit on the Pressable, so the responder is also the thing
        // that is sized and painted. There is no inner view for a touch to land on
        // instead, which is what left the previous version tappable only at the icon.
        style={[
          styles.wrapper,
          {
            backgroundColor: colors.backgroundAlt,
            borderColor: colors.borderLight,
          },
        ]}
      >
        <Icon name="search" size={20} color={colors.textMuted} />
        <Text
          numberOfLines={1}
          style={[styles.input, { color: colors.textMuted }]}
        >
          {placeholder}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: colors.backgroundAlt,
          borderColor: colors.borderLight,
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
          android_ripple={{ color: colors.ripple.primary, borderless: false }}
          style={[styles.clearButton, { backgroundColor: colors.primarySoft }]}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Icon name="close" size={14} color={colors.accent} />
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
    overflow: "hidden",
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    paddingVertical: spacing.sm,
    marginLeft: spacing.sm,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
