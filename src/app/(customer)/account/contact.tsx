import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import Input from "../../../components/common/Input";
import Button from "../../../components/common/Button";
import { useBottomInset } from "../../../hooks/useBottomInset";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight, letterSpacing } from "../../../constants/typography";
import { opacity, radius } from "../../../constants/sizes";
import config from "../../../constants/config";

export default function ContactUsScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  const handleMail = () => {
    const subject = encodeURIComponent(`Hibbullah support — ${name || "Customer"}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${msg}`);
    Linking.openURL(`mailto:${config.supportEmail}?subject=${subject}&body=${body}`);
    setSent(true);
  };

  return (
    <Screen header={<ScreenHeader title="Contact Us" onBack={goBack} />}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          <Text style={[styles.title, { color: colors.text }]}>We’re here to help</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Hibbullah, Dhaka · Support {config.supportEmail} · Reply within 24h. For order issues include Order Number.</Text>
          <Pressable
            onPress={() => Linking.openURL(`mailto:${config.supportEmail}`)}
            style={({ pressed }) => pressed && styles.pressed}
            accessibilityRole="link"
          >
            <Text style={[styles.link, { color: colors.accent }]}>{config.supportEmail}</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL("tel:+8809612345678")}
            style={({ pressed }) => pressed && styles.pressed}
            accessibilityRole="link"
          >
            <Text style={[styles.link, { color: colors.accent }]}>+880 96 1234 5678 (9am–9pm)</Text>
          </Pressable>
          <Text style={[styles.addr, { color: colors.textMuted }]}>House 12, Road 7, Dhanmondi, Dhaka 1209, Bangladesh</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          <Text style={[styles.section, { color: colors.text }]}>Send a message</Text>
          <Input label="Your name" value={name} onChangeText={setName} placeholder="Full name" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Input label="Message" value={msg} onChangeText={setMsg} placeholder="How can we help?" multiline />
          {sent ? <Text style={[styles.sent, { color: colors.success }]}>Opening mail app — we’ll reply soon.</Text> : null}
          <Button title="Email support" onPress={handleMail} disabled={!msg.trim()} fullWidth />
          <Text style={[styles.hint, { color: colors.textMuted }]}>This opens your mail app. No data leaves device except via email.</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  // White cards on the off-white page — no border, no shadow; the lightness step separates them.
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  title: {
    fontFamily: fontFamily.soraBold,
    fontSize: fontSize.title2,
    lineHeight: fontSize.title2 * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  sub: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  link: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  addr: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  section: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  sent: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
  hint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
  pressed: { opacity: opacity.pressed },
});
