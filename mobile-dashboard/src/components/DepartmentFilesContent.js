import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../styles/theme';
import { fetchFiles, refreshServerCaches } from '../services/portalApi';
import { useAuth } from '../context/AuthContext';
import EmptyState from './EmptyState';
import { canOpenFile } from '../utils/fileAccess';

/**
 * Shared file browser for a department (folders + list). Used from Department detail and Departments tab.
 */
export default function DepartmentFilesContent({
  department,
  navigation: _navigation,
  onOpenFile,
  onNeedAuth,
  /** When true, parent supplies ScreenHeader — hide duplicate title/breadcrumb. */
  embedded = false,
}) {
  const { token, session } = useAuth();
  const deptId = department?.id || '';
  const deptLabel = department?.label || department?.department || department?.name || deptId || 'Department';
  const [project, setProject] = useState('');
  const [q] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [files, setFiles] = useState([]);
  const canUpload = Boolean(session?.capabilities?.upload);
  const canRefreshServer = canUpload;

  const openFileDetails = (file) => {
    if (!canOpenFile(file)) return;
    if (typeof onOpenFile === 'function') {
      onOpenFile(file, department);
      return;
    }
    _navigation?.navigate?.('FileDetailsScreen', {
      departmentId: department.id,
      departmentName: deptLabel,
      file,
    });
  };

  const folders = useMemo(() => {
    const raw = department?.folders || [];
    const cleaned = raw
      .map((f) => ({
        id: f.id ?? f.name ?? '',
        name: f.name ?? '',
        has_access: f.has_access !== false,
        can_edit: f.can_edit !== false,
        permission: f.permission || 'edit',
      }))
      .filter((f) => f.id || f.name);
    const hasGeneral = cleaned.some((x) => String(x.name || '').toLowerCase() === 'general');
    return hasGeneral ? cleaned : [{ id: '', name: 'General', has_access: true, can_edit: true, permission: 'edit' }, ...cleaned];
  }, [department]);

  const load = async ({ forceRemote = false } = {}) => {
    if (!deptId) {
      setLoading(false);
      setError('Missing department.');
      setFiles([]);
      return;
    }
    if (!token) {
      setLoading(false);
      setFiles([]);
      if (typeof onNeedAuth === 'function') onNeedAuth(department);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await fetchFiles(token, { departmentId: deptId, project, q, refresh: forceRemote });
      setFiles(data?.files || []);
    } catch (e) {
      setError(e?.message || 'Could not load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load({ forceRemote: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, project, q, token]);

  const handleRefresh = async () => {
    if (canRefreshServer) {
      await refreshServerCaches(token).catch(() => null);
      await load({ forceRemote: true });
    } else {
      await load({ forceRemote: false });
    }
  };

  const renderFile = ({ item }) => {
    const openable = canOpenFile(item);
    const rowInner = (
      <>
        <View style={styles.rowLeft}>
          <View style={[styles.iconWrap, { backgroundColor: '#f1f5f9' }]}>
            <Text style={styles.iconText}>📄</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.nameText, !openable && styles.nameLocked]}>{item.name}</Text>
            <Text style={styles.metaText}>
              {(item.project || 'General') +
                (item.permission === 'view' ? ' · View' : item.permission === 'edit' ? ' · Edit' : item.permission === 'none' ? ' · No access' : '')}
            </Text>
          </View>
        </View>
        <Text style={styles.arrow}>{openable ? '›' : '🔒'}</Text>
      </>
    );
    if (openable) {
      return (
        <Pressable style={styles.fileRow} onPress={() => openFileDetails(item)}>
          {rowInner}
        </Pressable>
      );
    }
    return <View style={[styles.fileRow, styles.rowLocked]}>{rowInner}</View>;
  };

  return (
    <View style={[styles.inner, styles.padded]}>
      {!embedded ? (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{deptLabel}</Text>
            <Pressable onPress={handleRefresh} style={styles.refreshBtn}>
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={[styles.headerRow, styles.embeddedBar]}>
          <Text style={styles.embeddedHint}>Folders</Text>
          <Pressable onPress={handleRefresh} style={styles.refreshBtn}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.folderRow}>
        <ScrollChipRow
          items={folders}
          activeId={project}
          onSelect={(id, item) => {
            if (item?.has_access === false) return;
            setProject(id || '');
          }}
        />
      </View>

      {loading ? (
        <View style={styles.centerRow}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading files…</Text>
        </View>
      ) : error ? (
        <EmptyState title="Could not load files" message={error} actionLabel="Try again" onAction={() => load({ forceRemote: false })} />
      ) : files.length === 0 ? (
        <EmptyState title="No files" message="Nothing found in this folder." actionLabel="Refresh" onAction={handleRefresh} />
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => String(item.id || `${item.project}-${item.name}`)}
          renderItem={renderFile}
          contentContainerStyle={styles.listWrap}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function ScrollChipRow({ items, activeId, onSelect }) {
  return (
    <View style={styles.chipsWrap}>
      {(items || []).map((item) => {
        const id = item.id ?? item.name ?? '';
        const label = item.name || 'General';
        const active = String(activeId || '') === String(id || '');
        const locked = item.has_access === false;
        return (
          <Pressable
            key={String(id || label)}
            onPress={() => onSelect(id, item)}
            style={[styles.chip, active && styles.chipActive, locked && styles.chipLocked]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {locked ? '🔒 ' : ''}
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.cardPadding,
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  embeddedBar: { marginTop: 0 },
  embeddedHint: {
    ...typography.small,
    color: colors.neutralGray,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: { ...typography.headerMd, color: colors.heading },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  refreshText: { ...typography.small, color: colors.primaryBlue, fontWeight: '800' },
  folderRow: { marginBottom: 10 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: '#edf4ff', borderColor: '#c7d2fe' },
  chipLocked: { opacity: 0.7 },
  chipText: { ...typography.small, color: colors.neutralGray, fontWeight: '700' },
  chipTextActive: { color: colors.primaryBlue },
  listWrap: {
    paddingBottom: 10,
  },
  fileRow: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconText: {
    fontSize: 18,
    fontWeight: '700',
  },
  nameText: {
    ...typography.body,
    color: colors.heading,
    flexShrink: 1,
    fontWeight: '700',
  },
  metaText: { ...typography.small, color: colors.neutralGray, marginTop: 2 },
  arrow: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.neutralGray,
  },
  rowLocked: { opacity: 0.85 },
  nameLocked: { color: colors.neutralGray },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 18 },
  loadingText: { ...typography.body, color: colors.neutralGray },
});
