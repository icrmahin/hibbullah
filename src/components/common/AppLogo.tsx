import { Image } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";

const logoMain = require("@/assets/images/logo/hibbullah-main.png");

type AppLogoProps = {
  size?: number;
  style?: StyleProp<ImageStyle>;
  variant?: "dark" | "white";
};

export default function AppLogo({ size = 40, style, variant = "dark" }: AppLogoProps) {
  return (
    <Image
      source={logoMain}
      style={[
        { 
          width: size, 
          height: size, 
          borderRadius: size / 2, // FIX: Makes it perfectly round
        }, 
        style
      ]}
      contentFit="cover" // NOTE: Ensures the image fills the rounded container fully
      priority="high"
      accessibilityLabel="Hibbullah logo"
    />
  );
}