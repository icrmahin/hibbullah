import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useThemeColors } from "../../providers/ThemeProvider";
import spacing from "../../constants/spacing";
import typography, { fontFamily, fontSize } from "../../constants/typography";
import { radius } from "../../constants/sizes";
import Icon from "./Icon";
import { useImagePicker } from "../../hooks/useImagePicker";

type ImageUploadProps = {
  label: string;
  /**
   * `full` is the square slot the required photo needs. `compact` is the second, optional
   * photo: a short control that reads as "add another image" rather than as a second empty
   * frame the same size as the mandatory one, so the primary photo is plainly the required
   * one and this is plainly a bonus.
   */
  variant?: "full" | "compact";
  /** Draws the "Optional" tag on the compact control. */
  optional?: boolean;
  /** The stored URL, or a local file URI before it finishes uploading. */
  uri?: string | null;
  /** Receives the picked file. Uploading is the caller's job. */
  onPick: (localUri: string) => void;
  onRemove: () => void;
  uploading?: boolean;
  error?: string;
};

export default function ImageUpload({
  label,
  variant = "full",
  optional = false,
  uri,
  onPick,
  onRemove,
  uploading = false,
  error,
}: ImageUploadProps) {
  const colors = useThemeColors();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pick, error: pickerError } = useImagePicker({ aspect: [1, 1] });
  const compact = variant === "compact";

  const choose = async (source: "library" | "camera") => {
    setMenuOpen(false);
    const picked = await pick(source);
    if (picked) onPick(picked);
  };

  /**
   * Everything above the Replace/Remove row. The compact variant keeps the whole flow —
   * pick, upload, preview, the source menu — and only changes what an *empty* slot looks
   * like, which is the part that was reading as a second mandatory photo.
   */
  const body = uri ? (
    compact ? (
      <View
        style={[
          styles.compactPreview,
          { borderColor: colors.borderLight, backgroundColor: colors.background },
        ]}
      >
        <Image
          source={{ uri }}
          style={[styles.compactThumb, { backgroundColor: colors.borderSoft }]}
          contentFit="cover"
          transition={180}
        />
        {uploading ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Text style={[styles.compactPreviewText, { color: colors.textMuted }]}>
            Photo added
          </Text>
        )}
      </View>
    ) : (
      <View
        style={[
          styles.previewContainer,
          { borderColor: colors.borderLight, backgroundColor: colors.background },
        ]}
      >
        <Image
          source={{ uri }}
          style={[styles.preview, { backgroundColor: colors.borderSoft }]}
          contentFit="cover"
          transition={180}
        />
        {uploading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={colors.white} />
          </View>
        ) : null}
      </View>
    )
  ) : compact ? (
    <Pressable
      style={({ pressed }) => [
        styles.compactEmpty,
        {
          borderColor: error ? colors.danger : colors.borderLight,
          backgroundColor: colors.background,
        },
        pressed && styles.pressed,
      ]}
      onPress={() => setMenuOpen((open) => !open)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: add an optional image`}
      disabled={uploading}
    >
      {/*
        Stacked, not side by side. This control only ever gets the half of the image row
        that is left beside the required photo — about 130pt on a phone — and on one row
        the icon, the tag and the copy had to share it, which squeezed the sentence down to
        a couple of characters per line and made the *compact* box taller than the square.
        The head row is fixed content (icon, tag) so it always fits; the sentence gets the
        full width below it and wraps on its own.
      */}
      <View style={styles.compactHead}>
        {uploading ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          // A shopping cart with a plus on it: "add one more", beside the camera glyph the
          // required photo uses, so the two controls are not two copies of each other.
          <Icon name="add-shopping-cart" size={24} color={colors.accent} />
        )}
        {optional ? (
          <View style={[styles.optionalTag, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.optionalTagText, { color: colors.accent }]}>
              Optional
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[
          styles.emptyText,
          styles.compactTitle,
          { color: colors.text },
        ]}
      >
        {uploading ? "Uploading..." : "Add another photo"}
      </Text>
    </Pressable>
  ) : (
    <Pressable
      style={({ pressed }) => [
        styles.emptyState,
        {
          borderColor: error ? colors.danger : colors.borderLight,
          backgroundColor: colors.background,
        },
        pressed && styles.pressed,
      ]}
      onPress={() => setMenuOpen((open) => !open)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: choose an image`}
      disabled={uploading}
    >
      {uploading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Icon name="add-a-photo" size={28} color={colors.textMuted} />
      )}
      <Text style={[styles.emptyText, { color: colors.text }]}>
        {uploading ? "Uploading..." : "Add image"}
      </Text>
      <Text style={[styles.emptyHint, { color: colors.textMuted }]}>Tap to select</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>

      {body}

      <View style={styles.actions}>
        {uri ? (
          <Pressable
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight },
              pressed && styles.pressed,
            ]}
            onPress={() => setMenuOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={`${label}: replace the image`}
            disabled={uploading}
          >
            <Icon name="edit" size={14} color={colors.accent} />
            <Text style={[styles.actionText, { color: colors.text }]}>Replace</Text>
          </Pressable>
        ) : null}
        {uri ? (
          <Pressable
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: colors.redSoft, borderColor: colors.danger },
              pressed && styles.pressed,
            ]}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`${label}: remove the image`}
            disabled={uploading}
          >
            <Icon name="delete" size={14} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>Remove</Text>
          </Pressable>
        ) : null}
      </View>

      {/*
        The menu is a sibling of the preview rather than an absolutely positioned
        child. It used to be `position: absolute; bottom: 0` inside the preview,
        which has `overflow: hidden` and a border radius — so the menu rendered on
        top of the Replace/Remove buttons and was clipped by the rounded corners.
      */}
      {menuOpen ? (
        <View
          style={[
            styles.menu,
            { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight },
          ]}
        >
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={() => void choose("library")}
          >
            <Icon name="photo-library" size={18} color={colors.accent} />
            <Text style={[styles.menuText, { color: colors.text }]}>Choose from library</Text>
          </Pressable>
          <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} />
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={() => void choose("camera")}
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
  wrapper: { gap: spacing.xs },
  label: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: typography.bodySmall,
  },
  previewContainer: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
  },
  preview: {
    width: "100%",
    aspectRatio: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    // A scrim, not a surface. It sits over a photograph — a solid fill would hide the image
    // the user is waiting to see replaced — so it is the one place alpha is correct. The
    // token is `colors.overlay`'s sibling, kept hardcoded here because it is theme-invariant
    // by design: a dimming scrim over arbitrary photo content has to be the same in both
    // themes, and `colors.overlay` is 0.4 in light and 0.72 in dark.
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  actionText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: typography.label,
  },
  emptyState: {
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  emptyText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: typography.bodySmall,
  },
  emptyHint: {
    fontSize: typography.caption,
  },
  // The compact control: a short card, not a second square. It sits in the half of the
  // image row left beside the required photo, so the contents are stacked and centred
  // rather than fighting for one line — and it carries no `aspectRatio`, which is what
  // keeps the required photo the only large empty frame here.
  compactEmpty: {
    minHeight: 88,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    gap: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  // Icon on the left, Optional on the right: fixed-width content, so this row can never
  // squeeze anything. `stretch` gives it the full inner width to spread across, and the
  // wrap is the backstop for a 320pt phone where icon + tag would otherwise overrun it.
  compactHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    gap: spacing.sm,
  },
  // Stretched rather than left to size itself, so a long sentence wraps inside the card
  // instead of overrunning the dashed border.
  compactTitle: {
    alignSelf: "stretch",
    textAlign: "center",
  },
  compactPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 88,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  compactThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
  },
  compactPreviewText: {
    // Takes whatever the thumbnail leaves over (about 65pt) and wraps inside it, rather
    // than sizing to "Photo added" and poking through the border.
    flex: 1,
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: typography.caption,
  },
  optionalTag: {
    borderRadius: radius.sm,
    // xs rather than sm: in a half-width slot the tag shares one row with the icon, and
    // the extra 8pt of padding is what pushed the pair past the dashed border on a
    // 320pt screen.
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  optionalTagText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.micro,
  },
  menu: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  menuText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: typography.bodySmall,
  },
  pressed: { opacity: 0.6 },
  hairline: { height: 1 },
  error: { fontSize: typography.caption },
});
