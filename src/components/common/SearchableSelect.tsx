import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { radius, layout, opacity as opacityToken } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "./Icon";
import Input from "./Input";

export type SelectOption = {
  label: string;
  value: string;
  /** Secondary line, e.g. a manufacturer country. */
  hint?: string;
};

type SearchableSelectProps = {
  label?: string;
  value?: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
  /**
   * Omit for a client-side filter over `options`; supply it to search the
   * database instead. At a few thousand categories or manufacturers, filtering a
   * downloaded list in the app is neither fast nor accurate.
   */
  onSearch?: (term: string) => void;
  loading?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  error?: string;
  disabled?: boolean;
  /**
   * Shown on the trigger when `value` is set but is not in `options`.
   *
   * Without this, selecting a category and then typing a different search term
   * made the trigger silently fall back to the placeholder, so the applied
   * filter looked like it had been cleared while the list was still filtered by
   * it. The caller knows the label; the list may not contain it.
   */
  selectedLabel?: string;
  /** Rendered under the list, e.g. an inline "add new" form. */
  footer?: React.ReactNode;
  style?: ViewStyle;
};

/** Rows kept mounted around the visible area of the option list. */
const DRAW_DISTANCE = 600
const LIST_MAX_HEIGHT = 420

/**
 * A select that stays usable when the option list is large.
 *
 * The previous pickers were horizontal chip strips: with a few categories that
 * was fine, but at a few thousand the only way to reach an option was to scroll a
 * strip sideways with no way to filter, and the customer-facing filters in
 * `Select` mapped every option into a modal list at once. This searches as you
 * type and virtualizes the results, so the cost is bounded by what is on screen.
 */
export default function SearchableSelect({
  label,
  value,
  options,
  onSelect,
  onSearch,
  loading = false,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches found.",
  error,
  disabled = false,
  selectedLabel,
  footer,
  style,
}: SearchableSelectProps) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const selected = options.find((o) => o.value === value) ?? null;
  const triggerLabel = selected?.label ?? (value ? selectedLabel : undefined);
  // Without a server-side search, narrow the list here. With one, the caller
  // already narrowed it and re-filtering would hide valid results.
  const visible = onSearch
    ? options
    : term.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(term.trim().toLowerCase()))
      : options;

  const close = () => {
    setOpen(false);
    setTerm("");
    // Reset the server-side term so reopening the sheet starts from the full
    // list again rather than from whatever the last search left behind.
    onSearch?.("");
  };

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight },
          !!error && { borderColor: colors.danger },
          disabled && styles.triggerDisabled,
          pressed && !disabled && { opacity: opacityToken.pressed },
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        accessibilityLabel={label || placeholder}
      >
        <Text
          style={[
            styles.triggerText,
            { color: selected || triggerLabel ? colors.text : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {triggerLabel || placeholder}
        </Text>
        <Icon name="expand-more" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={close}>
          {/* Tapping inside must not close the sheet. */}
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.backgroundAlt, ...shadows.lg }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{label || placeholder}</Text>
              <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close">
                <Icon name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <Input
              value={term}
              onChangeText={(next) => {
                setTerm(next);
                onSearch?.(next);
              }}
              placeholder={searchPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : visible.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>{emptyMessage}</Text>
            ) : (
              <View style={styles.listWrap}>
                <FlashList
                  data={visible}
                  keyExtractor={(item: SelectOption) => item.value}
                  drawDistance={DRAW_DISTANCE}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const isSelected = item.value === value;
                    return (
                      <Pressable
                        onPress={() => {
                          onSelect(item.value);
                          close();
                        }}
                        style={({ pressed }) => [
                          styles.option,
                          isSelected && { backgroundColor: colors.primarySoft },
                          pressed && { opacity: opacityToken.pressed },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <View style={styles.optionTextWrap}>
                          <Text
                            style={[
                              styles.optionText,
                              isSelected && { color: colors.primary, fontFamily: fontFamily.semiBold },
                              { color: isSelected ? colors.primary : colors.text },
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                          {item.hint ? (
                            <Text style={[styles.optionHint, { color: colors.textMuted }]} numberOfLines={1}>
                              {item.hint}
                            </Text>
                          ) : null}
                        </View>
                        {isSelected ? <Icon name="check" size={18} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  }}
                />
              </View>
            )}

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Pressable>
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
  },
  triggerDisabled: { opacity: opacityToken.disabled },
  triggerText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.normal,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  sheet: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.callout,
    lineHeight: fontSize.callout * lineHeight.normal,
  },
  listWrap: { maxHeight: LIST_MAX_HEIGHT },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minHeight: layout.touch,
  },
  optionTextWrap: { flex: 1, gap: 2 },
  optionText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.normal,
  },
  optionHint: {
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  loading: { paddingVertical: spacing.xl, alignItems: "center" },
  empty: {
    fontSize: fontSize.caption,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  footer: { gap: spacing.sm },
});
