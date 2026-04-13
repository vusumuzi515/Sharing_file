import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../styles/theme';
import { useAuth } from '../context/AuthContext';
import { buildDownloadUrl } from '../services/api';
import { deleteFile } from '../services/portalApi';
import ScreenHeader from '../components/ScreenHeader';
import { canOpenOrDownloadFile, canDeleteFile, canOpenFile } from '../utils/fileAccess';

export default function FileDetailsScreen({ route, navigation }) {
  const { token, session } = useAuth();
  const departmentName = route?.params?.departmentName || 'Department';
  const file = route?.params?.file || {
    name: 'Unknown file',
    type: 'N/A',
    size: null,
  };

  const downloadUrl = file?.id && token ? buildDownloadUrl(file.id, token) : null;
  const canView = canOpenFile(file);
  const showOpen = Boolean(token && downloadUrl && canOpenOrDownloadFile(file, session));
  const showDelete = Boolean(token && canDeleteFile(file, session));
  const [deleting, setDeleting] = useState(false);

  const deptId = useMemo(() => route?.params?.departmentId || file?.departmentId || '', [route, file]);

  const handleDelete = () => {
    if (!token || !showDelete || !file?.id) return;
    Alert.alert('Delete file', `Remove “${file.name}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteFile(token, { fileId: file.id, departmentId: deptId });
            Alert.alert('Done', 'File removed.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
          } catch (e) {
            Alert.alert('Could not delete', e?.message || 'Try again');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="File" subtitle={file.name} />
      <View style={styles.container}>
        <View style={styles.card}>
          <Row label="Type" value={file.type || '—'} />
          <Row label="Size" value={file.size || '—'} />
          <Row label="Department" value={departmentName} />
          <Row label="Access" value={canView ? (file.permission === 'view' ? 'View' : 'Edit') : 'No access'} />

          {showOpen ? (
            <Pressable
              onPress={() => downloadUrl && Linking.openURL(downloadUrl)}
              style={styles.btn}
            >
              <Text style={styles.btnText}>Open</Text>
            </Pressable>
          ) : null}

          {showDelete ? (
            <Pressable
              disabled={deleting}
              onPress={handleDelete}
              style={[styles.btnDanger, deleting && styles.btnDisabled, !showOpen && styles.btnDangerFirst]}
            >
              <Text style={styles.btnDangerText}>{deleting ? '…' : 'Delete'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
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
  },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.cardPadding,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 12,
    gap: 12,
  },
  metaLabel: {
    ...typography.small,
    color: colors.neutralGray,
    fontWeight: '700',
    width: 88,
  },
  metaValue: {
    ...typography.body,
    color: colors.heading,
    flex: 1,
    textAlign: 'right',
    fontWeight: '600',
  },
  btn: {
    marginTop: 18,
    backgroundColor: colors.primaryBlue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  btnDangerFirst: { marginTop: 18 },
  btnDanger: {
    marginTop: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  btnDangerText: { color: '#b91c1c', fontWeight: '800' },
});
