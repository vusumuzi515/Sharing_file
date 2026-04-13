import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  FlatList,
} from 'react-native';
import { colors, spacing, typography } from '../styles/theme';
import { ensureApiBaseCacheCoherent, fetchDepartmentsPublic, fetchDepartments } from '../services/portalApi';
import { useAuth } from '../context/AuthContext';
import TabScreenHeader, { HeaderIconButton } from '../components/TabScreenHeader';

export default function DepartmentsScreen({ navigation }) {
  const { token, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState([]);
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError('');
    setLoading(true);
    (async () => {
      await ensureApiBaseCacheCoherent();
      if (cancelled) return;
      const run = isAuthenticated && token ? fetchDepartments(token) : fetchDepartmentsPublic();
      run
        .then((rows) => {
          if (!cancelled) setDepartments(rows || []);
        })
        .catch((e) => {
          if (!cancelled) setError(e?.message || 'Could not load');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token, reloadKey]);

  const openDepartment = (department) => {
    if (department?.has_access === false) return;
    if (!isAuthenticated) {
      navigation.navigate('DepartmentAuth', { department });
      return;
    }
    navigation.navigate('Home', {
      screen: 'DepartmentDetailScreen',
      params: { department },
    });
  };

  const rows = useMemo(() => departments || [], [departments]);
  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) => {
      const label = String(d?.label || d?.department || d?.name || d?.id || '').toLowerCase();
      const id = String(d?.id || '').toLowerCase();
      return label.includes(q) || id.includes(q);
    });
  }, [rows, query]);

  return (
    <SafeAreaView style={styles.safe}>
      <TabScreenHeader
        title="Departments"
        right={<HeaderIconButton label="Refresh" onPress={() => setReloadKey((k) => k + 1)} />}
      />
      <View style={styles.container}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.neutralGray}
          autoCapitalize="none"
          style={styles.searchInput}
        />

        {loading ? (
          <View style={styles.centerRow}>
            <ActivityIndicator color={colors.primaryBlue} />
            <Text style={styles.muted}>Loading…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setReloadKey((k) => k + 1)} style={styles.retryWrap}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(d) => String(d.id)}
            contentContainerStyle={styles.listWrap}
            renderItem={({ item }) => {
              const accessible = item.has_access !== false;
              return (
                <Pressable
                  style={[styles.row, !accessible && styles.rowDisabled]}
                  onPress={() => accessible && openDepartment(item)}
                >
                  <View style={[styles.dot, !accessible && styles.dotLocked]} />
                  <View style={styles.rowText}>
                    <Text style={styles.nameText}>{item.label || item.department || item.id}</Text>
                    {!accessible ? <Text style={styles.lock}>Locked</Text> : null}
                  </View>
                  <Text style={styles.chev}>{accessible ? '›' : ''}</Text>
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.lightGrayBackground,
  },
  container: {
    paddingHorizontal: spacing.cardPadding,
    paddingTop: 12,
    flex: 1,
  },
  searchInput: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.white,
    color: colors.heading,
    fontSize: 16,
    marginBottom: 12,
  },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 24 },
  muted: { ...typography.body, color: colors.neutralGray },
  listWrap: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowDisabled: { opacity: 0.55 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primaryBlue,
    marginRight: 12,
  },
  dotLocked: { backgroundColor: colors.neutralGray },
  rowText: { flex: 1 },
  nameText: {
    ...typography.body,
    color: colors.heading,
    fontWeight: '700',
  },
  lock: { ...typography.small, color: colors.neutralGray, marginTop: 2 },
  chev: { fontSize: 22, color: colors.neutralGray, fontWeight: '300' },
  sep: { height: 8 },
  errorCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.cardPadding,
  },
  errorText: { color: '#b91c1c', ...typography.body, fontWeight: '700' },
  retryWrap: { marginTop: 12, alignSelf: 'flex-start' },
  retryText: { color: colors.primaryBlue, fontWeight: '800' },
});
