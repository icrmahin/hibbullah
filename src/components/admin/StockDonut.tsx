import { Text, View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useThemeColors } from "../../providers/ThemeProvider";

export default function StockDonut({ healthy, low, out }: { healthy: number; low: number; out: number }) {
  const colors = useThemeColors();
  const total = Math.max(healthy + low + out, 1);
  const pctH = healthy / total;
  const pctL = low / total;
  const r = 32;
  const circ = 2 * Math.PI * r;
  const stroke = 8;

  return (
    <View style={styles.wrap}>
      <Svg width={84} height={84} viewBox="0 0 84 84">
        <Circle cx={42} cy={42} r={r} stroke={colors.borderSoft} strokeWidth={stroke} fill="none" />
        <Circle
          cx={42}
          cy={42}
          r={r}
          stroke={colors.success}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circ * pctH} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 42 42)"
        />
        <Circle
          cx={42}
          cy={42}
          r={r}
          stroke={colors.warning}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circ * pctL} ${circ}`}
          strokeDashoffset={-circ * pctH}
          strokeLinecap="round"
          transform="rotate(-90 42 42)"
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.pct, { color: colors.text }]}>{Math.round(pctH * 100)}%</Text>
        <Text style={[styles.label, { color: colors.textMuted }]}>healthy</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 84, height: 84, alignItems: "center", justifyContent: "center" },
  center: { position: "absolute", alignItems: "center" },
  pct: { fontSize: 16, fontWeight: "800" },
  label: { fontSize: 10, fontWeight: "600" },
});
