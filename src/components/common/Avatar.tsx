import { Image } from "expo-image";
import { memo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { layout } from "../../constants/sizes";
import { fontSize } from "../../constants/typography";

type AvatarProps = {
  uri?: string | null;
  /** Used for the initial-letter fallback. */
  name?: string | null;
  size?: number;
  /** Draws a ring in this color, e.g. to separate the avatar from its background. */
  borderColor?: string;
  borderWidth?: number;
  /** Above-the-fold avatars render eagerly; the rest stay lazy. */
  priority?: "low" | "high";
};

function initialsFrom(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function Avatar({
  uri,
  name,
  size = layout.avatar,
  borderColor,
  borderWidth = 0,
  priority = "low",
}: AvatarProps) {
  const colors = useThemeColors();
  const [failed, setFailed] = useState(false);

  const showImage = !!uri && !failed;
  const initials = initialsFrom(name);
  const fontScale = size >= 72 ? 1.6 : size >= 48 ? 1.15 : 1;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primary,
          borderWidth,
          borderColor: borderColor ?? "transparent",
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          // Same cache policy as ProductImage so an avatar re-upload cannot be
          // served stale from disk after profiles.avatar_url changes.
          cachePolicy="memory-disk"
          priority={priority}
          contentFit="cover"
          transition={120}
          onError={() => setFailed(true)}
          style={styles.image}
        />
      ) : (
        <Text
          numberOfLines={1}
          style={[
            styles.initials,
            { color: colors.white, fontSize: fontSize.body * fontScale },
          ]}
        >
          {initials || "?"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  initials: {
    fontWeight: "700",
  },
});

export default memo(Avatar);
