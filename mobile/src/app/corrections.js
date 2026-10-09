import { FlatList, StyleSheet, Text, View } from "react-native";
import { getCorrections } from "../api/manager";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import StatusPill from "../components/StatusPill";
import { useAsync } from "../hooks/useAsync";
import { colors, font, radius, spacing } from "../theme";
import { formatDay, timeRange, timeAgo } from "../utils/date";

// No status: every request, waiting ones first.
const loadAll = () => getCorrections();

function CorrectionCard({ correction }) {
  const { before, requested } = correction;
  const decided = correction.status !== "PENDING";

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.name}>{correction.employeeName}</Text>
          <Text style={font.small}>
            {formatDay(correction.date)} · asked {timeAgo(correction.requestedAt)}
          </Text>
        </View>
        <StatusPill status={correction.status} />
      </View>

      <Text style={font.body}>
        {before ? timeRange(before.checkIn, before.checkOut) : "No check-in"} →{" "}
        <Text style={styles.strong}>{timeRange(requested.checkIn, requested.checkOut ?? before?.checkOut)}</Text>
      </Text>
      <Text style={font.small}>“{correction.reason}”</Text>

      {decided && (
        <Text style={font.small}>
          {correction.status === "APPROVED" ? "Approved" : "Rejected"}
          {correction.decidedBy ? ` by ${correction.decidedBy}` : ""}
          {correction.decisionNote ? `: ${correction.decisionNote}` : ""}
        </Text>
      )}
    </View>
  );
}

export default function CorrectionsScreen() {
  const { status, data, error, reload, refresh, refreshing } = useAsync(loadAll);

  if (status === "loading") return <LoadingState label="Loading requests…" />;
  if (status === "error") return <ErrorState error={error} onRetry={reload} />;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={data}
      keyExtractor={(c) => String(c.id)}
      refreshing={refreshing}
      onRefresh={refresh}
      ListHeaderComponent={
        <Text style={[font.small, styles.intro]}>
          Corrections you asked HR for. Attendance only changes when HR approves.
        </Text>
      }
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      ListEmptyComponent={
        <EmptyState
          icon="document-text-outline"
          title="No requests yet"
          message="On the Attendance tab, tap a person to ask HR to correct a day."
        />
      }
      renderItem={({ item }) => <CorrectionCard correction={item} />}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, flexGrow: 1 },
  intro: { marginBottom: spacing.md },
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  strong: { fontWeight: "700" },
});
