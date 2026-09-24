import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { goBack } from "@/utils/navigation";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useShadows } from "../../../constants/shadows";
import SoftHeader from "../../../components/common/SoftHeader";
import Input from "../../../components/common/Input";
import Button from "../../../components/common/Button";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { radius } from "../../../constants/sizes";
import config from "../../../constants/config";

export default function ContactUsScreen() {
  const colors = useThemeColors();
  const shadows = useShadows();
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Contact Us" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.sm }]}>
          <Text style={[styles.title, { color: colors.text }]}>We’re here to help</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Hibbullah, Dhaka · Support {config.supportEmail} · Reply within 24h. For order issues include Order Number.</Text>
          <Pressable onPress={() => Linking.openURL(`mailto:${config.supportEmail}`)}><Text style={[styles.link, { color: colors.primary }]}>{config.supportEmail}</Text></Pressable>
          <Pressable onPress={() => Linking.openURL("tel:+8809612345678")}><Text style={[styles.link, { color: colors.primary }]}>+880 96 1234 5678 (9am–9pm)</Text></Pressable>
          <Text style={[styles.addr, { color: colors.textMuted }]}>House 12, Road 7, Dhanmondi, Dhaka 1209, Bangladesh</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
          <Text style={[styles.section, { color: colors.text }]}>Send a message</Text>
          <Input label="Your name" value={name} onChangeText={setName} placeholder="Full name" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Input label="Message" value={msg} onChangeText={setMsg} placeholder="How can we help?" multiline />
          {sent ? <Text style={[styles.sent, { color: colors.success }]}>Opening mail app — we’ll reply soon.</Text> : null}
          <Button title="Email support" onPress={handleMail} disabled={!msg.trim()} fullWidth />
          <Text style={[styles.hint, { color: colors.textMuted }]}>This opens your mail app. No data leaves device except via email.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: typography.h3, fontWeight: "700" },
  sub: { fontSize: typography.caption, lineHeight: 16 },
  link: { fontSize: typography.bodySmall, fontWeight: "700" },
  addr: { fontSize: typography.caption },
  section: { fontSize: typography.bodySmall, fontWeight: "700" },
  sent: { fontSize: typography.caption, textAlign: "center" },
  hint: { fontSize: typography.caption, textAlign: "center" },
});
