import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useThemeColors } from "../../providers/ThemeProvider";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";

export type IconName = ComponentProps<typeof MaterialIcons>["name"];

type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorValue | string;
};

export default function Icon({ name, size = 20, color }: IconProps) {
  const themeColors = useThemeColors();
  return <MaterialIcons name={name} size={size} color={(color ?? themeColors.text) as string} />;
}
