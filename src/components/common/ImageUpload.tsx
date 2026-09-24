import * as ImagePicker from "expo-image-picker";
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
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import Icon from "./Icon";

type ImageUploadProps = {
  label: string;
  uri?: string | null;
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
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>

      {uri ? (
        <View style={[styles.previewContainer, { borderColor: colors.borderLight, backgroundColor: colors.background, ...shadows.sm }]}>
          <Image source={{ uri }} style={[styles.preview, { backgroundColor: colors.borderSoft }]} resizeMode="cover" />
          {uploading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color={colors.white} />
            </View>
          ) : null}
          <View style={[styles.previewActions, { backgroundColor: colors.backgroundAlt }]}>
            <TouchableOpacity
              style={[styles.previewActionBtn, { borderColor: colors.borderLight, backgroundColor: colors.background }]}
              activeOpacity={0.7}
              onPress={() => setMenuOpen(!menuOpen)}
            >
              <Icon name="edit" size={14} color={colors.white} />
              <Text style={[styles.previewActionText, { color: colors.text }]}>Replace</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.previewActionBtn, { borderColor: colors.redSoft, backgroundColor: colors.redSoft }]}
              activeOpacity={0.7}
              onPress={onRemove}
            >
              <Icon name="delete" size={14} color={colors.danger} />
              <Text style={[styles.previewActionText, { color: colors.danger }]}>Remove</Text>
            </TouchableOpacity>
          </View>
          {menuOpen ? (
            <View style={[styles.dropdown, { backgroundColor: colors.backgroundAlt, borderTopColor: colors.borderLight }]}>
              <TouchableOpacity style={styles.dropdownItem} activeOpacity={0.7} onPress={pickFromLibrary}>
                <Icon name="photo-library" size={18} color={colors.primary} />
                <Text style={[styles.dropdownText, { color: colors.text }]}>Choose from library</Text>
              </TouchableOpacity>
              <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} />
              <TouchableOpacity style={styles.dropdownItem} activeOpacity={0.7} onPress={takePhoto}>
                <Icon name="camera-alt" size={18} color={colors.primary} />
                <Text style={[styles.dropdownText, { color: colors.text }]}>Take photo</Text>
              </TouchableOpacity>
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
          onPress={() => setMenuOpen(!menuOpen)}
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
          {menuOpen ? (
            <View style={[styles.dropdown, { backgroundColor: colors.backgroundAlt, borderTopColor: colors.borderLight }]}>
              <TouchableOpacity style={styles.dropdownItem} activeOpacity={0.7} onPress={pickFromLibrary}>
                <Icon name="photo-library" size={18} color={colors.primary} />
                <Text style={[styles.dropdownText, { color: colors.text }]}>Choose from library</Text>
              </TouchableOpacity>
              <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} />
              <TouchableOpacity style={styles.dropdownItem} activeOpacity={0.7} onPress={takePhoto}>
                <Icon name="camera-alt" size={18} color={colors.primary} />
                <Text style={[styles.dropdownText, { color: colors.text }]}>Take photo</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Pressable>
      )}

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
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
    position: "relative",
    borderRadius: 8,
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
  previewActions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  previewActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
  },
  previewActionText: {
    fontSize: typography.label,
    fontWeight: "600",
  },
  emptyState: {
    aspectRatio: 1,
    borderRadius: 8,
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
  dropdown: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
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
  },
  pressed: { opacity: 0.6 },
  hairline: { height: 1 },
  error: { fontSize: typography.caption },
});