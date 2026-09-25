import { StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import typography from "../../constants/typography";
import Input from "./Input";
import { COUNTRY_PREFIX, NATIONAL_LENGTH_DIGITS, toEditableDigits } from "../../utils/phone";
import type { TextInputProps } from "react-native";

type PhoneInputProps = Omit<TextInputProps, "value" | "onChangeText"> & {
  /** Canonical E.164 (`+8801XXXXXXXXX`) or bare national digits. */
  value?: string | null;
  /** Always receives the national digits only, e.g. `1812345678`. */
  onChangeDigits: (digits: string) => void;
  label?: string;
  error?: string;
  hint?: string;
};

/**
 * Bangladeshi phone entry with a fixed `+880` prefix.
 *
 * The country code is an adornment rather than typed text, so it cannot be typed
 * twice, omitted, or entered as `00880…`. The user types the 10 national digits
 * and the service layer turns them into canonical E.164.
 *
 * A pasted number in any of the forms people actually paste — `01812345678`,
 * `+8801812345678`, `880 1812-345678` — is stripped down to the same 10 digits
 * on the way in, so pasting into the middle of the field works too.
 */
export default function PhoneInput({
  value,
  onChangeDigits,
  label = "Phone number",
  error,
  hint,
  ...props
}: PhoneInputProps) {
  const colors = useThemeColors();

  const handleChange = (raw: string) => {
    let digits = raw.replace(/\D/g, "");
    // A leading country code is never part of a national number, so drop it
    // first. "880..." cannot begin a valid 10-digit Bangladeshi mobile number.
    if (digits.startsWith("880")) digits = digits.slice(3);
    // Then the local trunk prefix, 018… / 017… / 016… -> 18… / 17… / 16…
    if (digits.startsWith("0")) digits = digits.slice(1);
    onChangeDigits(digits.slice(0, NATIONAL_LENGTH_DIGITS));
  };

  return (
    <Input
      {...props}
      label={label}
      value={toEditableDigits(value)}
      onChangeText={handleChange}
      keyboardType="phone-pad"
      autoComplete="tel"
      inputMode="tel"
      maxLength={NATIONAL_LENGTH_DIGITS + 4}
      placeholder="1812345678"
      error={error}
      hint={hint}
      prefix={
        <Text style={[styles.prefix, { color: colors.textMuted }]} accessibilityLabel="Country code plus 880">
          {COUNTRY_PREFIX}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  prefix: {
    fontSize: typography.body,
    fontWeight: "700",
  },
});
