import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, type ImageStyle, type StyleProp } from "react-native";

const placeholder = require("@/assets/images/placeholders/product-placeholder.png");

type ProductImageProps = {
  uri?: string | null;
  recyclingKey?: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain";
};

function ProductImage({ uri, recyclingKey, style, contentFit = "cover" }: ProductImageProps) {
  return (
    <Image
      source={uri ? { uri } : placeholder}
      placeholder={placeholder}
      recyclingKey={recyclingKey}
      cachePolicy="memory-disk"
      priority="low"
      contentFit={contentFit}
      transition={recyclingKey ? 0 : 180}
      style={[styles.image, style]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: "100%",
    height: 140,
  },
});

export default memo(ProductImage);