import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, font, radius, spacing } from "../theme";
import { normalizeTime, relativeDayLabel } from "../utils/date";
import { fullName } from "../utils/status";
import Button from "./Button";

const TIME_KEYBOARD = Platform.select({ ios: "numbers-and-punctuation", default: "numeric" });

// Asks HR to correct one person's day. Managers can't change attendance themselves;
// nothing changes until an HR admin approves the request.
export default function CorrectionModal({ target, date, submitting, error, onCancel, onSubmit }) {
  return (
    <Modal visible={Boolean(target)} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={submitting ? undefined : onCancel} />
        {target && (
          // Keyed by person and day so the form starts fresh for every request.
          <CorrectionSheet
            key={`${target.employee.id}:${date}`}
            target={target}
            date={date}
            submitting={submitting}
            error={error}
            onCancel={onCancel}
            onSubmit={onSubmit}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TimeField({ label, value, placeholder, onChangeText, editable }) {
  return (
    <View style={styles.field}>
      <Text style={font.small}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={TIME_KEYBOARD}
        maxLength={5}
        style={styles.input}
        editable={editable}
        accessibilityLabel={label}
      />
    </View>
  );
}

function CorrectionSheet({ target, date, submitting, error, onCancel, onSubmit }) {
  const { employee, record } = target;
  const [checkIn, setCheckIn] = useState(record.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(record.checkOut ?? "");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState(null);

  const recorded = record.checkIn
    ? `Recorded: in ${record.checkIn} · out ${record.checkOut ?? "—"}`
    : "No check-in recorded";

  const send = () => {
    const inTime = normalizeTime(checkIn);
    const outTime = checkOut.trim() ? normalizeTime(checkOut) : null;

    if (!inTime) return setFormError("Enter the check-in time like 09:00.");
    if (checkOut.trim() && !outTime) return setFormError("Enter the check-out time like 17:00, or leave it empty.");
    if (outTime && outTime <= inTime) return setFormError("Check-out must be after check-in.");
    if (reason.trim().length < 3) return setFormError("Tell HR why this needs correcting.");

    setFormError(null);
    onSubmit({ employeeId: employee.id, date, checkIn: inTime, checkOut: outTime, reason });
  };

  return (
    <View style={styles.sheet}>
      <Text style={font.title}>Ask HR to correct</Text>
      <Text style={font.body}>
        {fullName(employee)} · {relativeDayLabel(date)}
      </Text>
      <Text style={font.small}>{recorded}</Text>

      <View style={styles.times}>
        <TimeField label="Check-in" value={checkIn} placeholder="09:00" onChangeText={setCheckIn} editable={!submitting} />
        <TimeField
          label="Check-out (optional)"
          value={checkOut}
          placeholder="17:00"
          onChangeText={setCheckOut}
          editable={!submitting}
        />
      </View>

      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Reason, e.g. fingerprint machine was down"
        placeholderTextColor={colors.muted}
        multiline
        maxLength={500}
        style={[styles.input, styles.reason]}
        editable={!submitting}
        accessibilityLabel="Reason"
      />

      <Text style={font.small}>HR reviews every request. Nothing changes until it is approved.</Text>

      {(formError || error) && <Text style={styles.error}>{formError || error}</Text>}

      <View style={styles.actions}>
        <Button title="Cancel" variant="outline" onPress={onCancel} disabled={submitting} style={styles.action} />
        <Button title="Send to HR" icon="send-outline" loading={submitting} onPress={send} style={styles.action} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(16, 24, 40, 0.45)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  times: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  field: { flex: 1, gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  reason: { minHeight: 80, marginTop: spacing.sm, textAlignVertical: "top" },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  action: { flex: 1 },
});
