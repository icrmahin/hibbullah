import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import spacing from "../../constants/spacing";
import typography, { fontFamily } from "../../constants/typography";
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
        <View style={[styles.avatarWrap, { borderColor: colors.borderSoft }]}>
          <Avatar uri={uri} name={name} size={size} priority="high" />
          {uploading ? (
            // A scrim over the avatar while it uploads, so it dims an image rather than
            // replacing it. `colors.white` on it is right in both themes: the scrim is
            // near-black either way.
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
              style={[
                styles.button,
                { backgroundColor: colors.primarySoft, borderColor: colors.borderSoft },
              ]}
              onPress={() => setMenuOpen((open) => !open)}
              android_ripple={{ color: colors.ripple.primary, borderless: false }}
              accessibilityRole="button"
              accessibilityLabel={hasImage ? "Change profile picture" : "Add profile picture"}
              disabled={uploading}
            >
              <Icon name={hasImage ? "edit" : "add-a-photo"} size={14} color={colors.accent} />
              <Text style={[styles.buttonText, { color: colors.accent }]}>
                {hasImage ? "Change" : "Add photo"}
              </Text>
            </Pressable>

            {hasImage ? (
              <Pressable
                style={[
                  styles.button,
                  { backgroundColor: colors.redSoft, borderColor: colors.danger },
                ]}
                onPress={onRemove}
                android_ripple={{ color: colors.ripple.danger, borderless: false }}
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
        <View style={[styles.menu, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft }]}>
          <Pressable
            style={styles.menuItem}
            onPress={() => void choose("library")}
            android_ripple={{ color: colors.ripple.primary, borderless: false }}
          >
            <Icon name="photo-library" size={18} color={colors.accent} />
            <Text style={[styles.menuText, { color: colors.text }]}>Choose from library</Text>
          </Pressable>
          <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} />
          <Pressable
            style={styles.menuItem}
            onPress={() => void choose("camera")}
            android_ripple={{ color: colors.ripple.primary, borderless: false }}
          >
            <Icon name="camera-alt" size={18} color={colors.accent} />
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
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flex: 1, gap: spacing.xs },
  title: { fontFamily: fontFamily.soraBold, fontSize: typography.bodySmall },
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
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  buttonText: { fontFamily: fontFamily.pjsBold, fontSize: typography.caption },
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
    overflow: "hidden",
  },
  menuText: { fontFamily: fontFamily.pjsSemiBold, fontSize: typography.bodySmall },
  hairline: { height: 1 },
  error: { fontSize: typography.caption },
});
