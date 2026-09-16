import * as ImagePicker from "expo-image-picker";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import colors from "../../constants/colors";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

type ImageUploadProps = {
  label: string;
  /** Current image URI (local or remote). */
  uri?: string | null;
  /** Called when user selects or captures a new image. */
  onPick: (localUri: string) => void;
  /** Called when user removes the current image. */
  onRemove: () => void;
  /** Loading state for upload. */
  uploading?: boolean;
  /** Error message, if any. */
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
  const [menuOpen, setMenuOpen] = useState(false);

  const pickFromLibrary = async () => {
    setMenuOpen(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      onPick(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    setMenuOpen(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      onPick(result.assets[0].uri);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      {uri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
          {uploading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color={colors.white} />
            </View>
          ) : null}
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.previewActionBtn}
              activeOpacity={0.7}
              onPress={() => setMenuOpen(!menuOpen)}
            >
              <SymbolView
                name={{ ios: "pencil", android: "edit", web: "edit" }}
                tintColor={colors.white}
                size={14}
              />
              <Text style={styles.previewActionText}>Replace</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.previewActionBtn, styles.removeActionBtn]}
              activeOpacity={0.7}
              onPress={onRemove}
            >
              <SymbolView
                name={{ ios: "trash", android: "delete", web: "delete" }}
                tintColor={colors.danger}
                size={14}
              />
              <Text style={[styles.previewActionText, styles.removeActionText]}>
                Remove
              </Text>
            </TouchableOpacity>
          </View>
          {menuOpen ? (
            <View style={styles.dropdown}>
              <TouchableOpacity style={styles.dropdownItem} activeOpacity={0.7} onPress={pickFromLibrary}>
                <SymbolView
                  name={{ ios: "photo.on.rectangle", android: "photo_library", web: "photo_library" }}
                  tintColor={colors.primary}
                  size={16}
                />
                <Text style={styles.dropdownText}>Choose from library</Text>
              </TouchableOpacity>
              <View style={styles.hairline} />
              <TouchableOpacity style={styles.dropdownItem} activeOpacity={0.7} onPress={takePhoto}>
                <SymbolView
                  name={{ ios: "camera.fill", android: "camera_alt", web: "camera_alt" }}
                  tintColor={colors.primary}
                  size={16}
                />
                <Text style={styles.dropdownText}>Take photo</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.emptyState,
            pressed && styles.pressed,
            !!error && styles.emptyStateError,
          ]}
          onPress={() => setMenuOpen(!menuOpen)}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <SymbolView
              name={{ ios: "photo.badge.plus", android: "add_a_photo", web: "add_a_photo" }}
              tintColor={colors.textMuted}
              size={24}
            />
          )}
          <Text style={styles.emptyText}>
            {uploading ? "Uploading…" : "Add image"}
          </Text>
          <Text style={styles.emptyHint}>Tap to select</Text>
          {menuOpen ? (
            <View style={styles.dropdown}>
              <TouchableOpacity style={styles.dropdownItem} activeOpacity={0.7} onPress={pickFromLibrary}>
                <SymbolView
                  name={{ ios: "photo.on.rectangle", android: "photo_library", web: "photo_library" }}
                  tintColor={colors.primary}
                  size={16}
                />
                <Text style={styles.dropdownText}>Choose from library</Text>
              </TouchableOpacity>
              <View style={styles.hairline} />
              <TouchableOpacity style={styles.dropdownItem} activeOpacity={0.7} onPress={takePhoto}>
                <SymbolView
                  name={{ ios: "camera.fill", android: "camera_alt", web: "camera_alt" }}
                  tintColor={colors.primary}
                  size={16}
                />
                <Text style={styles.dropdownText}>Take photo</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Pressable>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: {
    color: colors.text,
    fontSize: typography.bodySmall,
    fontWeight: "600",
  },
  previewContainer: {
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  preview: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: colors.borderSoft,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewActions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.backgroundAlt,
  },
  previewActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  previewActionText: {
    fontSize: typography.label,
    fontWeight: "600",
    color: colors.text,
  },
  removeActionBtn: {
    borderColor: colors.redSoft,
    backgroundColor: colors.redSoft,
  },
  removeActionText: {
    color: colors.danger,
  },
  emptyState: {
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  emptyStateError: {
    borderColor: colors.danger,
  },
  emptyText: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
    color: colors.text,
  },
  emptyHint: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  dropdown: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.backgroundAlt,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderRadius: 0,
    zIndex: 10,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  dropdownText: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
    color: colors.text,
  },
  hairline: { height: 1, backgroundColor: colors.borderSoft },
  pressed: { opacity: 0.6 },
  error: { color: colors.danger, fontSize: typography.caption },
});
