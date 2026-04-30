import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, spacing, typography } from '../styles/theme';
import { fetchDepartmentsPublic, login } from '../services/portalApi';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchDepartmentsPublic()
      .then((rows) => {
        if (!mounted) return;
        const list = rows || [];
        setDepartments(list);
        const first = list.find((d) => d?.id) || list[0];
        setDepartmentId(first?.id || '');
      })
      .catch((e) => mounted && setError(e?.message || 'Could not load departments'))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const deptLabel = useMemo(() => {
    const d = departments.find((x) => x.id === departmentId);
    return d?.label || d?.department || d?.id || '';
  }, [departments, departmentId]);

  const handleSubmit = async () => {
    setError('');
    if (!departmentId) return setError('Select a department');
    if (!employeeId.trim() || !password.trim()) return setError('Enter username and password');
    setSubmitting(true);
    try {
      const res = await login({ employeeId: employeeId.trim(), password: password.trim(), departmentId });
      await signIn({ token: res?.token, user: res?.user });
    } catch (e) {
      setError(e?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <Text style={styles.title}>Inyatsi Files</Text>
          <Text style={styles.subtitle}>Sign in with the same account as the web dashboard</Text>

          {loading ? (
            <View style={styles.centerRow}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>Loading departments…</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.label}>Department</Text>
              <Text style={styles.deptHint}>Choose the same department as on the web (from the live API).</Text>
              <View style={styles.deptList}>
                {departments.map((d) => {
                  const active = d.id === departmentId;
                  return (
                    <Pressable
                      key={String(d.id)}
                      onPress={() => setDepartmentId(d.id)}
                      style={[styles.deptChip, active && styles.deptChipActive]}
                    >
                      <Text style={[styles.deptChipText, active && styles.deptChipTextActive]}>
                        {d.label || d.department || d.id}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {deptLabel ? (
                <Text style={styles.selectedDept}>Selected: {deptLabel}</Text>
              ) : null}

              <Text style={[styles.label, { marginTop: 12 }]}>Username</Text>
              <TextInput
                value={employeeId}
                onChangeText={setEmployeeId}
                placeholder="Employee ID / server username"
                autoCapitalize="none"
                style={styles.input}
              />

              <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
                style={styles.input}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                style={[styles.btn, submitting && styles.btnDisabled]}
              >
                <Text style={styles.btnText}>{submitting ? 'Signing in…' : 'Sign in'}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.lightGrayBackground },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  container: { flex: 1, paddingHorizontal: spacing.cardPadding, paddingTop: 22 },
  title: { ...typography.headerLg, color: colors.heading },
  subtitle: { ...typography.body, color: colors.neutralGray, marginTop: 6, marginBottom: 18 },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 18 },
  loadingText: { ...typography.body, color: colors.neutralGray },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.cardPadding,
  },
  label: { ...typography.small, color: colors.neutralGray, fontWeight: '700' },
  deptHint: { ...typography.small, color: colors.neutralGray, marginTop: 4, marginBottom: 8 },
  deptList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  deptChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  deptChipActive: {
    backgroundColor: '#edf4ff',
    borderColor: '#c7d2fe',
  },
  deptChipText: { ...typography.small, color: colors.neutralGray, fontWeight: '700' },
  deptChipTextActive: { color: colors.primaryBlue },
  selectedDept: { ...typography.small, color: colors.heading, marginTop: 8, fontWeight: '600' },
  input: {
    marginTop: 6,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.white,
    color: colors.heading,
  },
  error: { marginTop: 10, color: '#b91c1c', ...typography.small, fontWeight: '700' },
  btn: {
    marginTop: 14,
    backgroundColor: colors.primaryBlue,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: colors.white, fontWeight: '800' },
});
