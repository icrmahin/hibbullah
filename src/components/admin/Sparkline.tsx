import { View } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { useThemeColors } from "../../providers/ThemeProvider";

export default function Sparkline({ data, color }: { data: number[]; color?: string }) {
  const colors = useThemeColors();
  const stroke = color || colors.primary;
  const w = 56;
  const h = 18;
  const pad = 2;
  if (!data || data.length < 2) return <View style={{ width: w, height: h }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);
  let d = "";
  data.forEach((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  // area
  const area = `${d} L ${pad + (data.length - 1) * stepX} ${h - pad} L ${pad} ${h - pad} Z`;
  const lastX = pad + (data.length - 1) * stepX;
  const lastY = pad + (h - pad * 2) * (1 - (data[data.length - 1] - min) / range);
  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Path d={area} fill={stroke} fillOpacity={0.1} stroke="none" />
        <Path d={d} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={lastX} cy={lastY} r={2.2} fill={stroke} />
      </Svg>
    </View>
  );
}
