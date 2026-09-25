import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import { radius } from "../../constants/sizes";
import Icon from "./Icon";
import Avatar from "./Avatar";
import { useImagePicker } from "../../hooks/useImagePicker";

type AvatarPickerProps = {
  /** Current avatar URL, or null/undefined when none is set. */
  uri?: string | null;
  /** Used for the initials fallback and the change-button label. */
  name?: string | null;
  size?: number;
  uploading?: boolean;
  onPick: (localUri: string) => void;
  onRemove: () => void;
  error?: string | null;
};

/**
 * Circular profile-picture picker.
 *
 * The image is uploaded the moment it is chosen rather than on form submit:
 * the binary goes straight to Cloudinary and the returned URL is saved, so
 * there is no pending local file to lose, and replace/delete behaves the same
 * whether it happens on the first save or the fiftieth.
 */
export default function AvatarPicker({
  uri,
  name,
  size = 104,
  uploading = false,
  onPick,
  onRemove,
  error,
}: AvatarPickerProps) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pick, error: pickerError } = useImagePicker({ aspect: [1, 1] });

  const choose = async (source: "library" | "camera") => {
    setMenuOpen(false);
    const picked = await pick(source);
    if (picked) onPick(picked);
  };

  const hasImage = !!uri;

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View style={[styles.avatarWrap, { borderColor: colors.borderSoft, ...shadows.sm }]}>
          <Avatar uri={uri} name={name} size={size} priority="high" />
          {uploading ? (
            <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
              <ActivityIndicator size="small" color={colors.white} />
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Text style={[styles.title, { color: colors.text }]}>Profile picture</Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {hasImage ? "Shown on your account and orders." : "Add a photo so staff can recognise you."}
          </Text>

          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primarySoft, borderColor: colors.borderSoft },
                pressed && styles.pressed,
              ]}
              onPress={() => setMenuOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={hasImage ? "Change profile picture" : "Add profile picture"}
              disabled={uploading}
            >
              <Icon name={hasImage ? "edit" : "add-a-photo"} size={14} color={colors.primary} />
              <Text style={[styles.buttonText, { color: colors.primary }]}>
                {hasImage ? "Change" : "Add photo"}
              </Text>
            </Pressable>

            {hasImage ? (
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: colors.redSoft, borderColor: colors.danger },
                  pressed && styles.pressed,
                ]}
                onPress={onRemove}
                accessibilityRole="button"
                accessibilityLabel="Remove profile picture"
                disabled={uploading}
              >
                <Icon name="delete" size={14} color={colors.danger} />
                <Text style={[styles.buttonText, { color: colors.danger }]}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {/* Rendered outside the clipped avatar circle so the menu is never cut off. */}
      {menuOpen ? (
        <View style={[styles.menu, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.sm }]}>
          <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={() => void choose("library")}>
            <Icon name="photo-library" size={18} color={colors.primary} />
            <Text style={[styles.menuText, { color: colors.text }]}>Choose from library</Text>
          </Pressable>
          <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} />
          <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={() => void choose("camera")}>
            <Icon name="camera-alt" size={18} color={colors.primary} />
            <Text style={[styles.menuText, { color: colors.text }]}>Take photo</Text>
          </Pressable>
        </View>
      ) : null}

      {error || pickerError ? (
        <Text style={[styles.error, { color: colors.danger }]}>{error || pickerError}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  avatarWrap: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flex: 1, gap: spacing.xs },
  title: { fontSize: typography.bodySmall, fontWeight: "700" },
  hint: { fontSize: typography.caption },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  buttonText: { fontSize: typography.caption, fontWeight: "700" },
  menu: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  menuText: { fontSize: typography.bodySmall, fontWeight: "600" },
  hairline: { height: 1 },
  pressed: { opacity: 0.6 },
  error: { fontSize: typography.caption },
});
