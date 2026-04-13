import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../styles/theme';
import { useAuth } from '../context/AuthContext';
import { fetchRecentFileVisits } from '../services/portalApi';
import EmptyState from '../components/EmptyState';
import TabScreenHeader, { HeaderIconButton } from '../components/TabScreenHeader';

function formatWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function QuickAccessScreen() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visits, setVisits] = useState([]);

  const load = async () => {
    if (!token) return;
    setError('');
    setLoading(true);
    try {
      const rows = await fetchRecentFileVisits(token, 60);
      setVisits(rows || []);
    } catch (e) {
      setError(e?.message || 'Could not load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <SafeAreaView style={styles.safe}>
      <TabScreenHeader title="Activity" right={token ? <HeaderIconButton label="Refresh" onPress={load} /> : null} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {!token ? (
          <EmptyState title="Sign in" message="Required." />
        ) : loading ? (
          <View style={styles.centerRow}>
            <ActivityIndicator color={colors.primaryBlue} />
            <Text style={styles.muted}>Loading…</Text>
          </View>
        ) : error ? (
          <EmptyState title="Error" message={error} actionLabel="Retry" onAction={load} />
        ) : visits.length === 0 ? (
          <EmptyState title="Empty" actionLabel="Refresh" onAction={load} />
        ) : (
          <View style={styles.listWrap}>
            {visits.map((a) => (
              <View key={a.id} style={styles.row}>
                <Text style={styles.fileName} numberOfLines={2}>
                  {a.fileName || 'File'}
                </Text>
                <Text style={styles.rowMeta}>
                  {(a.visitorName || a.employeeId || '') +
                    (a.project ? ` · ${a.project}` : '')}
                </Text>
                {a.timestamp ? <Text style={styles.time}>{formatWhen(a.timestamp)}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.lightGrayBackground },
  container: { paddingHorizontal: spacing.cardPadding, paddingTop: 12, paddingBottom: 24 },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 24 },
  muted: { ...typography.body, color: colors.neutralGray },
  listWrap: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  fileName: { ...typography.body, color: colors.heading, fontWeight: '700' },
  rowMeta: { ...typography.small, color: colors.neutralGray, marginTop: 4 },
  time: { ...typography.small, color: colors.neutralGray, marginTop: 4 },
});
