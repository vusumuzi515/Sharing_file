import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing, typography } from '../styles/theme';
import { fetchUsersGrouped } from '../services/portalApi';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';

export default function UsersScreen({ navigation }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setGroups([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchUsersGrouped(token);
      setGroups(res.groups || []);
    } catch (e) {
      setError(e?.message || 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (!token) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader navigation={navigation} title="Team" />
        <View style={styles.pad}>
          <EmptyState title="Sign in" message="Required." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Team" />
      <View style={styles.pad}>
        {loading ? (
          <View style={styles.centerRow}>
            <ActivityIndicator color={colors.primaryBlue} />
            <Text style={styles.muted}>Loading…</Text>
          </View>
        ) : error ? (
          <EmptyState title="Error" message={error} actionLabel="Retry" onAction={() => setReloadKey((k) => k + 1)} />
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => String(item.departmentId || item.label)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.deptName}>{item.label || item.departmentId}</Text>
                {(item.users || []).map((u) => (
                  <View key={`${item.departmentId}-${u.employeeId}`} style={styles.userRow}>
                    <Text style={styles.userName}>{u.name || u.employeeId}</Text>
                    <Text style={styles.userMeta}>
                      {u.employeeId}
                      {u.role ? ` · ${u.role}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            ListEmptyComponent={<Text style={styles.muted}>No results.</Text>}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.lightGrayBackground },
  pad: { flex: 1, paddingHorizontal: spacing.cardPadding, paddingTop: 8 },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 24 },
  muted: { ...typography.body, color: colors.neutralGray },
  list: { paddingBottom: 24 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  deptName: { ...typography.headerSm, color: colors.heading, marginBottom: 8, fontWeight: '800' },
  userRow: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  userName: { ...typography.body, color: colors.heading, fontWeight: '700' },
  userMeta: { ...typography.small, color: colors.neutralGray, marginTop: 2 },
});
