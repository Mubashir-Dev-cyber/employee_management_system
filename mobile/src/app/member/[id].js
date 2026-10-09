import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { getMemberAttendance, getMemberLeave, getTeamMember } from "../../api/manager";
import Avatar from "../../components/Avatar";
import Card from "../../components/Card";
import CorrectionTag from "../../components/CorrectionTag";
import { leaveSummary } from "../../components/LeaveCard";
import { ErrorState, LoadingState } from "../../components/States";
import StatusPill from "../../components/StatusPill";
import { useAsync } from "../../hooks/useAsync";
import { colors, font, spacing } from "../../theme";
import { formatIsoDate, relativeDayLabel, timeRange } from "../../utils/date";
import { fullName } from "../../utils/status";

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={font.small}>{label}</Text>
      <Text style={styles.detailValue}>{value || "—"}</Text>
    </View>
  );
}

export default function MemberScreen() {
  const { id } = useLocalSearchParams();
  const load = useCallback(async () => {
    const [member, leave, attendance] = await Promise.all([
      getTeamMember(id),
      getMemberLeave({ id }),
      getMemberAttendance({ id }, 7),
    ]);
    return { member, attendance, leave };
  }, [id]);
  const { status, data, error, reload } = useAsync(load);

  const title = data ? fullName(data.member) : "Team member";

  let body;
  if (status === "loading") body = <LoadingState />;
  else if (status === "error") body = <ErrorState error={error} onRetry={reload} />;
  else {
    const { member, attendance, leave } = data;
    body = (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.profile}>
            <Avatar firstName={member.firstName} lastName={member.lastName} size={64} />
            <View style={styles.flex}>
              <Text style={font.title}>{fullName(member)}</Text>
              <Text style={font.small}>
                {[member.position, member.department].filter(Boolean).join(" · ") || "No position set"}
              </Text>
              <View style={styles.pill}>
                <StatusPill status={member.status} />
              </View>
            </View>
          </View>
        </Card>

        <Card title="Details">
          <DetailRow label="Employee ID" value={member.employeeId} />
          <DetailRow label="Email" value={member.email} />
          <DetailRow label="Phone" value={member.phone} />
          <DetailRow label="Department" value={member.department} />
          <DetailRow label="Position" value={member.position} />
          <DetailRow label="Hire date" value={formatIsoDate(member.hireDate)} />
        </Card>

        <Card title="Last 7 days">
          {attendance.map((record) => (
            <View key={record.date} style={styles.listRow}>
              <View style={styles.flex}>
                <Text style={font.body}>{relativeDayLabel(record.date)}</Text>
                <CorrectionTag correction={record.correction} />
              </View>
              <Text style={font.small}>{timeRange(record.checkIn, record.checkOut)}</Text>
              <StatusPill status={record.status} />
            </View>
          ))}
        </Card>

        <Card title="Leave history">
          {leave.length === 0 ? (
            <Text style={font.small}>No leave requests.</Text>
          ) : (
            leave.map((request) => (
              <View key={request.id} style={styles.listRow}>
                <View style={styles.flex}>
                  <Text style={font.body}>{request.type} leave</Text>
                  <Text style={font.small}>{leaveSummary(request)}</Text>
                </View>
                <StatusPill status={request.status} />
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  flex: { flex: 1 },
  profile: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  pill: { marginTop: spacing.sm },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailValue: { fontSize: 15, color: colors.text, flexShrink: 1, textAlign: "right" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
