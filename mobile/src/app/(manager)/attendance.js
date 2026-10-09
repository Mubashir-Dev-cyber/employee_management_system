import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { getTeamAttendance, requestCorrection } from "../../api/manager";
import Avatar from "../../components/Avatar";
import CorrectionModal from "../../components/CorrectionModal";
import CorrectionTag from "../../components/CorrectionTag";
import { EmptyState, ErrorState, LoadingState } from "../../components/States";
import StatusPill from "../../components/StatusPill";
import { useAsync } from "../../hooks/useAsync";
import { colors, font, radius, spacing } from "../../theme";
import { addDays, formatDay, relativeDayLabel, todayKey } from "../../utils/date";
import { fullName } from "../../utils/status";

const SUMMARY = ["PRESENT", "LATE", "ABSENT", "ON_LEAVE"];

function describe(record, shift) {
  switch (record.status) {
    case "PRESENT":
    case "LATE":
      return `In ${record.checkIn} · Out ${record.checkOut ?? "—"}`;
    case "ON_LEAVE":
      return "Approved leave";
    case "ABSENT":
      return "No check-in";
    case "NOT_IN":
      return `Shift starts ${shift.start}`;
    default:
      return "No shift";
  }
}

function DateNav({ date, shift, onChange }) {
  const isToday = date === todayKey();
  const label = relativeDayLabel(date);
  const subtitle = label === formatDay(date) ? "" : formatDay(date);
  const details = [subtitle, shift && `Shift ${shift.start}–${shift.end}`].filter(Boolean).join(" · ");
  return (
    <View style={styles.dateNav}>
      <Pressable
        accessibilityLabel="Previous day"
        onPress={() => onChange(addDays(date, -1))}
        style={({ pressed }) => [styles.navButton, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </Pressable>
      <View style={styles.dateLabel}>
        <Text style={font.heading}>{label}</Text>
        {details ? <Text style={font.small}>{details}</Text> : null}
      </View>
      <Pressable
        accessibilityLabel="Next day"
        disabled={isToday}
        onPress={() => onChange(addDays(date, 1))}
        style={({ pressed }) => [styles.navButton, (pressed || isToday) && { opacity: 0.35 }]}
      >
        <Ionicons name="chevron-forward" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

function RequestsLink({ onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="document-text-outline" size={18} color={colors.primary} />
      <Text style={styles.linkText}>My correction requests</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function AttendanceScreen() {
  const router = useRouter();
  const [date, setDate] = useState(todayKey);
  const load = useCallback(() => getTeamAttendance(date), [date]);
  const { status, data, error, reload, refresh, revalidate, refreshing } = useAsync(load);
  const [target, setTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const openCorrection = (row) => {
    setSendError(null);
    setTarget(row);
  };

  const sendCorrection = async (body) => {
    setSubmitting(true);
    setSendError(null);
    try {
      await requestCorrection(body);
      setToast(`Sent to HR: correction for ${fullName(target.employee)}`);
      setTarget(null);
      revalidate();
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  let body;
  if (status === "loading") body = <LoadingState label="Loading attendance…" />;
  else if (status === "error") body = <ErrorState error={error} onRetry={reload} />;
  else {
    const canCorrect = data.rows.some((row) => row.record.correctable);
    body = (
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.content}
        data={data.workday ? data.rows : []}
        keyExtractor={(row) => String(row.employee.id)}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.header}>
            {toast && (
              <View style={styles.toast} accessibilityLiveRegion="polite">
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.toastText}>{toast}</Text>
              </View>
            )}
            {data.workday && (
              <View style={styles.summary}>
                {SUMMARY.map((key) => (
                  <View key={key} style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{data.counts[key]}</Text>
                    <StatusPill status={key} />
                  </View>
                ))}
              </View>
            )}
            <RequestsLink onPress={() => router.push("/corrections")} />
            {data.workday && canCorrect && (
              <Text style={font.small}>Wrong time? Tap a person to ask HR for a correction.</Text>
            )}
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          data.workday ? (
            <EmptyState icon="people-outline" title="No team members yet" />
          ) : (
            <EmptyState icon="cafe-outline" title="Weekend" message="No shift is scheduled on this day." />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            disabled={!item.record.correctable}
            onPress={() => openCorrection(item)}
            accessibilityRole={item.record.correctable ? "button" : undefined}
            accessibilityHint={item.record.correctable ? "Ask HR to correct this day" : undefined}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <Avatar firstName={item.employee.firstName} lastName={item.employee.lastName} size={36} />
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {fullName(item.employee)}
              </Text>
              <Text style={font.small}>{describe(item.record, data.shift)}</Text>
              <CorrectionTag correction={item.record.correction} />
            </View>
            <StatusPill status={item.record.status} />
          </Pressable>
        )}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <DateNav date={date} shift={data?.shift} onChange={setDate} />
      {body}

      <CorrectionModal
        target={target}
        date={date}
        submitting={submitting}
        error={sendError}
        onCancel={() => setTarget(null)}
        onSubmit={sendCorrection}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dateLabel: { flex: 1, alignItems: "center" },
  content: { padding: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  summaryItem: { alignItems: "center", gap: spacing.xs },
  summaryValue: { fontSize: 20, fontWeight: "700", color: colors.text },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  linkText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  toastText: { flex: 1, color: colors.success, fontWeight: "600" },
  separator: { height: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
});
