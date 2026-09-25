import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";

type Source = "library" | "camera";

type PickerOptions = {
  /** Aspect ratio applied by the system cropper. [1,1] for avatars. */
  aspect?: [number, number];
  /** Allows the user to skip the crop step. */
  allowEditing?: boolean;
};

/**
 * One implementation of "choose a photo" for every picker in the app.
 *
 * ImageUpload and AvatarPicker previously each carried their own copy of the
 * permission request + launch + `result.canceled` handling, which is how the two
 * drifted apart. It also collapses the previous "denied permission returns
 * nothing at all" failure mode into an explicit message, because a silently
 * dead button is impossible to debug from the user's side.
 */
export function useImagePicker(options: PickerOptions = {}) {
  const { aspect = [1, 1], allowEditing = true } = options;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(
    async (source: Source): Promise<string | null> => {
      setError(null);

      try {
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (permission.status !== "granted") {
            setError("Camera permission is needed to take a photo.");
            return null;
          }
        } else {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (permission.status !== "granted") {
            setError("Photo library permission is needed to choose an image.");
            return null;
          }
        }

        setBusy(true);
        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({ allowsEditing: allowEditing, aspect, quality: 0.8 })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: allowEditing,
                aspect,
                quality: 0.8,
              });

        if (result.canceled || !result.assets?.[0]) return null;
        return result.assets[0].uri;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open the image picker.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [allowEditing, aspect],
  );

  return { pick, busy, error, setError };
}
