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
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const selected = options.find((o) => o.value === value) ?? null;
  const triggerLabel = selected?.label ?? (value ? selectedLabel : undefined);
  // Without a server-side search, narrow the list here. With one, the caller
  // already narrowed it and re-filtering would hide valid results.
  //
  // `value` and `hint` are searched as well as `label`, so an option can be found by
  // anything the caller put on the row. This matters for the district picker, where a
  // customer may know their district only in Bangla ("ঢাকা") while `label` is the
  // English name — matching `label` alone made the search look broken for exactly the
  // users most likely to need it.
  const matches = (o: SelectOption, needle: string) =>
    o.label.toLowerCase().includes(needle) ||
    o.value.toLowerCase().includes(needle) ||
    (o.hint ?? "").toLowerCase().includes(needle);
  const visible = onSearch
    ? options
    : term.trim()
      ? options.filter((o) => matches(o, term.trim().toLowerCase()))
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
            style={[styles.sheet, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}
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
                <ActivityIndicator size="small" color={colors.accent} />
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
                        android_ripple={{ color: colors.ripple.primary, borderless: false }}
                        style={[
                          styles.option,
                          isSelected && { backgroundColor: colors.primarySoft },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <View style={styles.optionTextWrap}>
                          <Text
                            style={[
                              styles.optionText,
                              isSelected && { color: colors.accent, fontFamily: fontFamily.semiBold },
                              { color: isSelected ? colors.accent : colors.text },
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
                        {isSelected ? <Icon name="check" size={18} color={colors.accent} /> : null}
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
    overflow: "hidden",
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
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.title3,
    lineHeight: fontSize.title3 * lineHeight.tight,
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
    overflow: "hidden",
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
