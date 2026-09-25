import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import { radius } from "../../constants/sizes";
import Icon from "./Icon";
import { useImagePicker } from "../../hooks/useImagePicker";

type ImageUploadProps = {
  label: string;
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
  uri,
  onPick,
  onRemove,
  uploading = false,
  error,
}: ImageUploadProps) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pick, error: pickerError } = useImagePicker({ aspect: [1, 1] });

  const choose = async (source: "library" | "camera") => {
    setMenuOpen(false);
    const picked = await pick(source);
    if (picked) onPick(picked);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>

      {uri ? (
        <View
          style={[
            styles.previewContainer,
            { borderColor: colors.borderLight, backgroundColor: colors.background, ...shadows.sm },
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
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.emptyState,
            {
              borderColor: error ? colors.danger : colors.borderLight,
              backgroundColor: colors.background,
              ...shadows.xs,
            },
            pressed && styles.pressed,
          ]}
          onPress={() => setMenuOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: choose an image`}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="add-a-photo" size={28} color={colors.textMuted} />
          )}
          <Text style={[styles.emptyText, { color: colors.text }]}>
            {uploading ? "Uploading..." : "Add image"}
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>Tap to select</Text>
        </Pressable>
      )}

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
            <Icon name="edit" size={14} color={colors.primary} />
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
            { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight, ...shadows.sm },
          ]}
        >
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={() => void choose("library")}
          >
            <Icon name="photo-library" size={18} color={colors.primary} />
            <Text style={[styles.menuText, { color: colors.text }]}>Choose from library</Text>
          </Pressable>
          <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} />
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={() => void choose("camera")}
          >
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
  wrapper: { gap: spacing.xs },
  label: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
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
    borderRadius: 6,
    borderWidth: 1,
  },
  actionText: {
    fontSize: typography.label,
    fontWeight: "600",
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
    fontSize: typography.bodySmall,
    fontWeight: "600",
  },
  emptyHint: {
    fontSize: typography.caption,
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
    fontSize: typography.bodySmall,
    fontWeight: "600",
  },
  pressed: { opacity: 0.6 },
  hairline: { height: 1 },
  error: { fontSize: typography.caption },
});
