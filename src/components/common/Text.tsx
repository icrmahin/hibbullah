import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { fontFamily, fontSize, lineHeight as lh, letterSpacing as ls } from "../../constants/typography";
import { useThemeColors } from "../../providers/ThemeProvider";

type TextVariant =
  | "largeTitle"
  | "title1"
  | "title2"
  | "title3"
  | "body"
  | "callout"
  | "bodySmall"
  | "footnote"
  | "caption"
  | "micro";

type TextWeight = "regular" | "medium" | "semiBold" | "bold";

type Props = Omit<RNTextProps, "style"> & {
  variant?: TextVariant;
  weight?: TextWeight;
  color?: string;
  align?: TextStyle["textAlign"];
  style?: TextStyle | TextStyle[];
};

const variantStyles: Record<TextVariant, TextStyle> = {
  largeTitle: { fontSize: fontSize.largeTitle, lineHeight: fontSize.largeTitle * lh.tight, letterSpacing: ls.tight },
  title1: { fontSize: fontSize.title1, lineHeight: fontSize.title1 * lh.tight, letterSpacing: ls.tight },
  title2: { fontSize: fontSize.title2, lineHeight: fontSize.title2 * lh.tight },
  title3: { fontSize: fontSize.title3, lineHeight: fontSize.title3 * lh.normal },
  body: { fontSize: fontSize.body, lineHeight: fontSize.body * lh.normal },
  callout: { fontSize: fontSize.callout, lineHeight: fontSize.callout * lh.normal },
  bodySmall: { fontSize: fontSize.bodySmall, lineHeight: fontSize.bodySmall * lh.normal },
  footnote: { fontSize: fontSize.footnote, lineHeight: fontSize.footnote * lh.normal },
  caption: { fontSize: fontSize.caption, lineHeight: fontSize.caption * lh.normal },
  micro: { fontSize: fontSize.micro, lineHeight: fontSize.micro * lh.normal },
};

const weightMap: Record<TextWeight, string> = {
  regular: fontFamily.regular,
  medium: fontFamily.medium,
  semiBold: fontFamily.semiBold,
  bold: fontFamily.bold,
};

export default function Text({
  variant = "body",
  weight = "regular",
  color,
  align,
  style,
  children,
  ...props
}: Props) {
  const themeColors = useThemeColors();
  const textColor = color ?? themeColors.text;
  return (
    <RNText
      style={[
        variantStyles[variant],
        { fontFamily: weightMap[weight], color: textColor },
        align && { textAlign: align },
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
}