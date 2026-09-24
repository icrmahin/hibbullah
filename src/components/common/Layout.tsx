import { View, type ViewProps } from "react-native";

type StackProps = ViewProps & {
  /** Horizontal alignment. Default: "stretch" */
  align?: "start" | "center" | "end" | "stretch";
  /** Gap between children. Uses spacing tokens. */
  gap?: number;
};

/**
 * Vertical flex container. Direction is always column.
 */
export function Stack({ align = "stretch", gap = 0, style, children, ...props }: StackProps) {
  return (
    <View
      style={[
        { flexDirection: "column", gap },
        align !== "stretch" && { alignItems: align === "start" ? "flex-start" : align === "end" ? "flex-end" : "center" },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

type RowProps = ViewProps & {
  /** Vertical alignment. Default: "center" */
  align?: "start" | "center" | "end" | "stretch";
  /** Horizontal distribution. Default: "start" */
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  /** Gap between children. Uses spacing tokens. */
  gap?: number;
  /** Wrap children to next line. Default: false */
  wrap?: boolean;
};

/**
 * Horizontal flex container. Direction is always row.
 */
export function Row({ align = "center", justify = "start", gap = 0, wrap = false, style, children, ...props }: RowProps) {
  return (
    <View
      style={[
        { flexDirection: "row", gap },
        align !== "stretch" && { alignItems: align === "start" ? "flex-start" : align === "end" ? "flex-end" : "center" },
        { justifyContent: justify === "start" ? "flex-start" : justify === "end" ? "flex-end" : justify === "between" ? "space-between" : justify === "around" ? "space-around" : justify === "evenly" ? "space-evenly" : "center" },
        wrap && { flexWrap: "wrap" },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

export default Stack;
