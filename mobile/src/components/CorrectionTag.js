import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

// Shows when a day has a correction waiting for HR, or was corrected by HR.
const TAGS = {
  PENDING: { icon: "hourglass-outline", label: "Correction waiting for HR", color: colors.warning },
  APPROVED: { icon: "checkmark-done-outline", label: "Corrected by HR", color: colors.info },
};

export default function CorrectionTag({ correction }) {
  const tag = correction && TAGS[correction.status];
  if (!tag) return null;

  return (
    <View style={styles.tag}>
      <Ionicons name={tag.icon} size={13} color={tag.color} />
      <Text style={[styles.text, { color: tag.color }]}>{tag.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  text: { fontSize: 12, fontWeight: "600" },
});
