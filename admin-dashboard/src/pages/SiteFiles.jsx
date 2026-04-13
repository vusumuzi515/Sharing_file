import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchDepartmentsPublic,
  getDownloadUrl,
  getFilePreviewPageUrl,
  getCurrentUser,
  loginDashboard,
  refreshFilesFromServerCache,
  uploadFile,
} from '../services/monitoringApi';
import { useAuthSync } from '../hooks/useAuthSync';
import { useDepartments, useFiles, useProjects, useRefreshDepartments } from '../hooks/useFiles';
import { useToast } from '../context/ToastContext';
import { useDepartment } from '../context/DepartmentContext';
import { IconFolder, IconLock, IconSearch, IconArrowLeft } from '../components/Icons';
import BottomActionBar from '../components/BottomActionBar';
import Breadcrumb from '../components/Breadcrumb';
import { FileListSkeleton } from '../components/FileListSkeleton';
function normalizeDepartmentLabel(label, id) {
  const trimmed = String(label || '').trim();
  if (id === 'finance' && /^finance\s*documents$/i.test(trimmed)) return 'Finance Documents';
  return trimmed || '';
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Modified Today';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFileIcon(fileType) {
  const t = String(fileType || '').toLowerCase();
  if (t === 'pdf') return '📄';
  if (t === 'xlsx' || t === 'xls' || t === 'csv') return '📊';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(t)) return '🖼';
  return '📎';
}

/** Show matches only after this many typed chars (between 2–4 keeps suggestions focused). Not shown in the UI. */
const DEPT_SEARCH_MIN_CHARS = 3;

export default function SiteFiles() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const deptSearchInputRef = useRef(null);
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [pendingUploadProjectId, setPendingUploadProjectId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [deptPickerQuery, setDeptPickerQuery] = useState('');
  const [publicDepartments, setPublicDepartments] = useState([]);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authDepartmentId, setAuthDepartmentId] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { setDepartment, clearDepartment } = useDepartment();
  const { isAuthenticated } = useAuthSync();

  const selectedDept = searchParams.get('department') || '';
  const selectedProject = searchParams.get('project') || '';

  const { data: departments = [], isLoading: deptsLoading, isFetching: deptsFetching, error: deptsError } = useDepartments();
  const refreshDepartmentsFn = useRefreshDepartments();
  const { data: projectsData = [], isLoading: projectsLoading, error: projectsError } = useProjects(selectedDept);
  const { data: filesData, isLoading: filesLoading, error: filesError } = useFiles(selectedDept, selectedProject, search);

  useEffect(() => {
    if (projectsError) showToast(projectsError?.message ?? 'Could not load folders');
  }, [projectsError, showToast]);
  useEffect(() => {
    if (filesError) showToast(filesError?.message ?? 'Could not load files');
  }, [filesError, showToast]);

  useEffect(() => {
    if (isAuthenticated) {
      setPublicDepartments([]);
      return;
    }
    fetchDepartmentsPublic()
      .then((items) => {
        const mapped = (items || []).map((item) => ({
          id: item.id,
          label: item.label || item.department || item.id,
          has_access: true,
        }));
        setPublicDepartments(mapped);
      })
      .catch(() => setPublicDepartments([]));
  }, [isAuthenticated]);

  const departmentsWithAccess = isAuthenticated ? departments : publicDepartments;

  const filteredDepartments = useMemo(() => {
    const q = deptPickerQuery.trim().toLowerCase();
    if (q.length < DEPT_SEARCH_MIN_CHARS) return [];
    return departmentsWithAccess.filter((dept) => {
      const label = normalizeDepartmentLabel(dept.label, dept.id).toLowerCase();
      const id = String(dept.id || '').toLowerCase();
      return label.includes(q) || id.includes(q);
    });
  }, [departmentsWithAccess, deptPickerQuery]);

  const deptQueryReady = deptPickerQuery.trim().length >= DEPT_SEARCH_MIN_CHARS;

  const openDepartmentPicker = () => {
    setDeptPickerOpen(true);
    queueMicrotask(() => deptSearchInputRef.current?.focus());
  };

  useEffect(() => {
    if (!deptPickerOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setDeptPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deptPickerOpen]);

  useEffect(() => {
    if (!folderMenuOpen && !uploadMenuOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setFolderMenuOpen(false);
        setUploadMenuOpen(false);
      }
    };
    const onPointerDown = (e) => {
      const target = e.target;
      if (!target?.closest?.('[data-folder-trigger]') && !target?.closest?.('[data-folder-menu]')) {
        setFolderMenuOpen(false);
      }
      if (!target?.closest?.('[data-upload-trigger]') && !target?.closest?.('[data-upload-menu]')) {
        setUploadMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [folderMenuOpen, uploadMenuOpen]);

  const currentUser = getCurrentUser();
  const fixedDepartmentId =
    isAuthenticated && String(currentUser?.departmentId || '').toLowerCase() !== 'admin'
      ? String(currentUser?.departmentId || '').trim()
      : '';
  const hasFixedDepartment = Boolean(fixedDepartmentId);

  /** Use the list actually shown on the grid (API when logged in, public list when logged out). */
  const selectedDeptData = departmentsWithAccess.find((d) => d.id === selectedDept);
  const deptHasAccess =
    Boolean(selectedDept) &&
    (isAuthenticated && deptsLoading
      ? true
      : selectedDeptData != null && selectedDeptData.has_access !== false);

  useEffect(() => {
    if (!hasFixedDepartment) return;
    if (selectedDept === fixedDepartmentId) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('department', fixedDepartmentId);
      if (selectedDept && selectedDept !== fixedDepartmentId) {
        next.delete('project');
      }
      return next;
    });
  }, [hasFixedDepartment, fixedDepartmentId, selectedDept, setSearchParams]);

  useEffect(() => {
    if (selectedDept && !deptHasAccess) {
      setSearchParams({});
      clearDepartment();
      showToast('You do not have access to this department');
    }
  }, [selectedDept, deptHasAccess, setSearchParams, clearDepartment, showToast]);

  useEffect(() => {
    if (selectedDeptData && deptHasAccess) {
      setDepartment({
        id: selectedDeptData.id,
        name: normalizeDepartmentLabel(selectedDeptData.label, selectedDeptData.id),
        folderPath: selectedDeptData.folderPath,
      });
    } else if (!selectedDept) {
      clearDepartment();
    }
  }, [selectedDept, selectedDeptData, deptHasAccess, setDepartment, clearDepartment]);

  const foldersFromDept = selectedDeptData?.folders ?? [];
  const deptAllowsUpload = selectedDeptData?.permission === 'edit';
  const projects = foldersFromDept.length > 0
    ? foldersFromDept.map((f) => ({
      id: f.id ?? f.name,
      name: f.name,
      type: 'folder',
      has_access: f.has_access !== false,
      can_edit: f.can_edit !== false,
    }))
    : projectsData;
  const hasGeneral = projects.some((p) => (p.name || '').toLowerCase() === 'general');
  const projectsWithGeneral = projects.length > 0
    ? (hasGeneral
      ? projects
      : [{ id: '', name: 'General', type: 'folder', has_access: true, can_edit: deptAllowsUpload }, ...projects])
    : [];
  const files = filesData?.files ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const visibleProjects = useMemo(
    () => projectsWithGeneral.filter((project) => project.has_access !== false),
    [projectsWithGeneral],
  );
  const filteredVisibleProjects = useMemo(() => {
    if (!normalizedSearch) return visibleProjects;
    return visibleProjects.filter((project) => String(project.name || '').toLowerCase().includes(normalizedSearch));
  }, [visibleProjects, normalizedSearch]);
  const currentProject = useMemo(
    () => visibleProjects.find((project) => String(project.id) === String(selectedProject)) ?? null,
    [visibleProjects, selectedProject],
  );
  const uploadableProjects = useMemo(
    () => visibleProjects.filter((project) => project.can_edit !== false),
    [visibleProjects],
  );
  const canUpload = uploadableProjects.length > 0;
  const hasFileResults = files.length > 0;

  const handleRefresh = async () => {
    try {
      await refreshDepartmentsFn();
      queryClient.invalidateQueries({ queryKey: ['path-acl'] });
      showToast('Updated from the file server.');
    } catch {
      queryClient.invalidateQueries({ queryKey: ['path-acl'] });
      showToast('Could not refresh departments');
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const handleDepartmentSelect = (deptId) => {
    if (!isAuthenticated) {
      setAuthDepartmentId(deptId);
      setAuthUsername('');
      setAuthPassword('');
      setAuthError('');
      setDeptPickerOpen(false);
      setDeptPickerQuery('');
      setShowAuthPrompt(true);
      return;
    }
    const dept = departmentsWithAccess.find((d) => d.id === deptId);
    if (!dept?.has_access) return;
    setDeptPickerQuery('');
    setDeptPickerOpen(false);
    setSearchParams({ department: deptId, project: '' });
  };

  const handleDepartmentAuth = async (event) => {
    event.preventDefault();
    if (!authDepartmentId || !authUsername || !authPassword) {
      setAuthError('Enter username and password.');
      return;
    }
    setAuthSubmitting(true);
    setAuthError('');
    try {
      await loginDashboard({
        username: authUsername,
        password: authPassword,
        departmentId: authDepartmentId,
      });
      await queryClient.invalidateQueries();
      setDeptPickerQuery('');
      setDeptPickerOpen(false);
      setSearchParams({ department: authDepartmentId, project: '' });
      setShowAuthPrompt(false);
    } catch (err) {
      setAuthError(err?.message || 'Authentication failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleBack = () => {
    if (selectedProject) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('project');
        return next;
      });
    } else if (hasFixedDepartment) {
      navigate(-1);
    } else if (selectedDept) {
      setSearchParams({});
      clearDepartment();
      setDeptPickerQuery('');
      setDeptPickerOpen(false);
    } else {
      navigate(-1);
    }
  };

  const canGoBack = Boolean(selectedProject || (!hasFixedDepartment && selectedDept));

  useEffect(() => {
    setSearch('');
    setSearchInput('');
  }, [selectedDept, selectedProject]);

  const handleProjectSelect = (projectId) => {
    const proj = projectsWithGeneral.find((p) => p.id === projectId);
    if (!proj?.has_access) return;
    setFolderMenuOpen(false);
    setSearchParams((prev) => ({ ...prev, project: projectId }));
  };

  const handleUploadTargetSelect = (projectId) => {
    setPendingUploadProjectId(projectId);
    setUploadMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleUploadButtonClick = () => {
    if (!selectedDept || !canUpload) return;
    if (uploadableProjects.length === 1) {
      handleUploadTargetSelect(uploadableProjects[0].id);
      return;
    }
    setUploadMenuOpen((open) => !open);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDept) return;
    const dept = departmentsWithAccess.find((d) => d.id === selectedDept);
    if (!dept?.has_access) return;
    const uploadProjectId = pendingUploadProjectId || selectedProject || 'General';
    const uploadTargetAllowed =
      uploadProjectId === '' || uploadableProjects.some((project) => String(project.id) === String(uploadProjectId));
    if (!uploadTargetAllowed) {
      showToast('Upload is not allowed in this folder.');
      return;
    }
    setUploading(true);
    try {
      const data = await uploadFile(file, selectedDept, uploadProjectId);
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      refreshFilesFromServerCache().catch(() => {});
      showToast(
        data?.replaced
          ? 'File updated on the server — everyone in this department will see the latest version.'
          : 'File uploaded — visible to everyone in this department.',
      );
    } catch (err) {
      showToast(err?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      setPendingUploadProjectId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deptDisplayName = selectedDeptData ? normalizeDepartmentLabel(selectedDeptData.label, selectedDeptData.id) : '';
  const folderDisplayName = selectedProject
    ? (projectsWithGeneral.find((p) => p.id === selectedProject)?.name || selectedProject)
    : null;

  return (
    <div className="space-y-8 pb-20 sm:pb-0 transition-opacity duration-200">
      {/* Back button (mobile) + Breadcrumb & Actions */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-h-[48px] items-center gap-3">
          {canGoBack && (
          <button
            type="button"
            onClick={handleBack}
            className="btn btn-secondary flex min-h-[48px] min-w-[48px] shrink-0 !p-0 sm:min-h-[44px] sm:min-w-[44px]"
            aria-label="Go back"
          >
              <IconArrowLeft className="h-5 w-5" />
            </button>
          )}
          <Breadcrumb
            departmentName={deptDisplayName || undefined}
            folderName={folderDisplayName || undefined}
            departmentId={selectedDept || undefined}
          />
        </div>
        <div className="w-full xl:min-w-[26rem] xl:max-w-3xl">
          {selectedDept && (
            <form onSubmit={handleSearchSubmit} className="w-full">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/88 p-2 shadow-sm backdrop-blur-md xl:flex-nowrap">
                <div className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-xl bg-white/80 px-3">
                  <IconSearch className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search files or folders"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="min-h-[40px] w-full border-0 bg-transparent px-0 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                  />
                </div>
                <button type="submit" className="btn btn-primary min-h-[40px] rounded-xl px-4 text-sm">
                  Search
                </button>
                {selectedDept && visibleProjects.length > 0 ? (
                  <div className="relative" data-folder-trigger>
                    <button
                      type="button"
                      onClick={() => setFolderMenuOpen((open) => !open)}
                      className="btn btn-secondary min-h-[40px] rounded-xl px-4 text-sm"
                    >
                      {folderDisplayName || 'Folders'}
                    </button>
                    {folderMenuOpen ? (
                      <div
                        className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
                        data-folder-menu
                      >
                        <div className="max-h-64 overflow-y-auto">
                          {filteredVisibleProjects.length === 0 ? (
                            <p className="px-3 py-3 text-sm text-slate-500">No matching folders.</p>
                          ) : (
                            filteredVisibleProjects.map((project) => {
                              const isSelected = String(project.id) === String(selectedProject);
                              return (
                                <button
                                  key={project.id}
                                  type="button"
                                  onClick={() => handleProjectSelect(project.id)}
                                  className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm ${
                                    isSelected ? 'bg-[#0e5b45] text-white' : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  {project.name}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={deptsFetching}
                    className="btn btn-secondary min-h-[40px] rounded-xl px-4 text-sm"
                  >
                    {deptsFetching ? 'Refreshing…' : 'Refresh'}
                  </button>
                ) : null}
                {selectedDept && canUpload && (
                  <div className="relative" data-upload-trigger>
                    <button
                      type="button"
                      onClick={handleUploadButtonClick}
                      disabled={uploading || uploadableProjects.length === 0}
                      className="btn btn-primary min-h-[40px] rounded-xl px-4 text-sm"
                    >
                      {uploading ? 'Uploading...' : 'Upload File'}
                    </button>
                    {uploadMenuOpen ? (
                      <div
                        className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
                        data-upload-menu
                      >
                        <div className="max-h-64 overflow-y-auto">
                          {uploadableProjects.map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => handleUploadTargetSelect(project.id)}
                              className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              {project.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {isAuthenticated && deptsError && (
        <div className="alert-error">{deptsError?.message ?? 'Could not load departments'}</div>
      )}

      {/* Department: single trigger + compact panel (keeps watermark visible) */}
      {(!selectedDept || !deptHasAccess) && !hasFixedDepartment && (
        <div className="flex justify-center pt-4 sm:justify-start">
          {!deptPickerOpen ? (
            <button
              type="button"
              onClick={openDepartmentPicker}
              disabled={deptsLoading && departmentsWithAccess.length === 0}
              className="inline-flex min-h-[48px] items-center gap-2.5 rounded-full bg-[#0e5b45] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/15 transition hover:bg-[#0b4737] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0e5b45] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
            >
              <IconSearch className="h-5 w-5 opacity-95" aria-hidden />
              {deptsLoading && departmentsWithAccess.length === 0 ? 'Loading…' : 'Find department'}
            </button>
          ) : null}
        </div>
      )}

      {deptPickerOpen && (!selectedDept || !deptHasAccess) && !hasFixedDepartment ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-x-0 bottom-0 top-[6.25rem] z-[35] cursor-default bg-transparent lg:top-[7rem]"
            onClick={() => setDeptPickerOpen(false)}
          />
          <div
            className="fixed left-1/2 top-[max(6.5rem,env(safe-area-inset-top,0px)+5rem)] z-[45] w-[min(calc(100vw-1.5rem),22rem)] -translate-x-1/2 rounded-2xl border border-slate-200/70 bg-white/92 p-3 shadow-2xl shadow-slate-900/10 backdrop-blur-xl lg:top-[max(7.5rem,env(safe-area-inset-top,0px)+5.5rem)]"
            role="dialog"
            aria-modal="true"
            aria-label="Choose department"
          >
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={deptSearchInputRef}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Search department"
                value={deptPickerQuery}
                onChange={(e) => setDeptPickerQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/80 py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0e5b45]/40 focus:outline-none focus:ring-2 focus:ring-[#0e5b45]/25"
              />
            </div>
            <div className="mt-2 max-h-[min(50vh,18rem)] overflow-y-auto overscroll-contain rounded-xl border border-slate-100 bg-slate-50/80">
              {!deptQueryReady ? (
                <div className="min-h-[7.5rem] rounded-lg bg-slate-50/30" aria-hidden />
              ) : deptsLoading ? (
                <div className="p-2">
                  <FileListSkeleton rows={4} />
                </div>
              ) : departmentsWithAccess.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">No departments.</p>
              ) : (
                <ul className="p-1.5" role="listbox" aria-label="Departments">
                  {filteredDepartments.length === 0 ? (
                    <li className="px-2 py-5 text-center text-sm text-slate-500">No matches.</li>
                  ) : (
                    filteredDepartments.map((dept) => {
                      const hasAccess = dept.has_access !== false;
                      const displayLabel = normalizeDepartmentLabel(dept.label, dept.id);
                      return (
                        <li key={dept.id}>
                          <button
                            type="button"
                            role="option"
                            onClick={() => hasAccess && handleDepartmentSelect(dept.id)}
                            disabled={!hasAccess}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm ${
                              hasAccess
                                ? 'text-slate-800 hover:bg-white'
                                : 'cursor-not-allowed text-slate-400 opacity-60'
                            }`}
                          >
                            {hasAccess ? (
                              <IconFolder className="h-4 w-4 shrink-0 text-slate-500" />
                            ) : (
                              <span className="relative shrink-0">
                                <IconFolder className="h-4 w-4 text-slate-300" />
                                <IconLock className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-slate-400" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate font-medium">{displayLabel || dept.id}</span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}

      {/* Files list */}
      {selectedDept && deptHasAccess && (filesLoading || hasFileResults) ? (
        <section className="space-y-3 transition-opacity duration-200">
          <h3 className="text-base font-semibold text-slate-800">Files</h3>
          {filesLoading && !files.length ? (
            <FileListSkeleton rows={5} />
          ) : (
            <div className="card overflow-hidden rounded-2xl">
              {/* Mobile (<640px): card layout */}
              <div className="divide-y divide-slate-100 sm:hidden">
                {files.map((file) => {
                  const hasAccess = file.has_access !== false;
                  const canDownload = file.can_download !== false;
                  return (
                    <div
                      key={file.id}
                      className={`flex min-h-[56px] items-center gap-4 px-4 py-4 ${hasAccess ? '' : 'cursor-not-allowed bg-slate-50 opacity-55'}`}
                    >
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xl">
                        {hasAccess ? getFileIcon(file.fileType) : (
                          <>
                            <span className="opacity-50">{getFileIcon(file.fileType)}</span>
                            <IconLock className="absolute -bottom-0.5 -right-0.5 h-4 w-4 text-slate-500" />
                          </>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800">{file.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatSize(file.size)} • {formatDate(file.uploadedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {hasAccess ? (
                          <a
                            href={getFilePreviewPageUrl(file)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-secondary"
                          >
                            View
                          </a>
                        ) : null}
                        {hasAccess && canDownload ? (
                          <a
                            href={getDownloadUrl(file.id)}
                            download
                            className="btn btn-sm btn-secondary"
                          >
                            Download
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tablet (640–1024px): simplified list */}
              <div className="hidden divide-y divide-slate-100 sm:block lg:hidden">
                {files.map((file) => {
                  const hasAccess = file.has_access !== false;
                  const canDownload = file.can_download !== false;
                  return (
                    <div
                      key={file.id}
                      className={`flex min-h-[48px] items-center gap-3 px-4 py-3 ${hasAccess ? 'hover:bg-slate-50/50' : 'cursor-not-allowed bg-slate-50 opacity-55'}`}
                    >
                      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-base">
                        {hasAccess ? getFileIcon(file.fileType) : (
                          <>
                            <span className="opacity-50">{getFileIcon(file.fileType)}</span>
                            <IconLock className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-slate-500" />
                          </>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                        <p className="text-xs text-slate-500">{formatSize(file.size)} • {formatDate(file.uploadedAt)}</p>
                      </div>
                      {hasAccess ? (
                        <div className="flex shrink-0 items-center gap-3">
                          <a
                            href={getFilePreviewPageUrl(file)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-brand hover:text-brand-light hover:underline"
                          >
                            View
                          </a>
                          {canDownload ? (
                            <a
                              href={getDownloadUrl(file.id)}
                              download
                              className="text-sm font-medium text-brand hover:text-brand-light hover:underline"
                            >
                              Download
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <span className="shrink-0 text-sm text-slate-400">—</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop (≥1024px): table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead>
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Name</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Size</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Modified</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {files.map((file) => {
                      const hasAccess = file.has_access !== false;
                      const canDownload = file.can_download !== false;
                      return (
                        <tr
                          key={file.id}
                          className={hasAccess ? 'hover:bg-slate-50/50' : 'cursor-not-allowed bg-slate-50 opacity-55'}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg">
                                {hasAccess ? getFileIcon(file.fileType) : (
                                  <>
                                    <span className="opacity-50">{getFileIcon(file.fileType)}</span>
                                    <IconLock className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 text-slate-500" />
                                  </>
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-slate-800">{file.name}</p>
                                {(file.uploadedByName || file.uploadedBy) && (
                                  <p className="text-xs text-slate-500">by {file.uploadedByName || file.uploadedBy}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{formatSize(file.size)}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{formatDate(file.uploadedAt)}</td>
                          <td className="px-6 py-4 text-right">
                            {hasAccess ? (
                              <div className="flex items-center justify-end gap-4">
                                <a
                                  href={getFilePreviewPageUrl(file)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium text-brand hover:text-brand-light hover:underline"
                                >
                                  View
                                </a>
                                {canDownload ? (
                                  <a
                                    href={getDownloadUrl(file.id)}
                                    download
                                    className="text-sm font-medium text-brand hover:text-brand-light hover:underline"
                                  >
                                    Download
                                  </a>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <input ref={fileInputRef} type="file" onChange={handleUpload} className="hidden" accept="*" />

      <BottomActionBar
        onUpload={() => fileInputRef.current?.click()}
        onRefresh={handleRefresh}
        uploading={uploading}
        refreshing={deptsFetching}
        showUpload={selectedDept && canUpload}
      />

      {showAuthPrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4">
          <form
            onSubmit={handleDepartmentAuth}
            className="card w-full max-w-md p-5"
          >
            <h3 className="text-lg font-semibold text-slate-800">Department Access</h3>
            <p className="mt-1 text-sm text-slate-500">
              {departmentsWithAccess.find((d) => d.id === authDepartmentId)?.label || authDepartmentId}
            </p>
            <div className="mt-4 space-y-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Username</span>
                <input
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="input"
                  autoFocus
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="input"
                />
              </label>
              {authError ? <p className="text-sm text-amber-700">{authError}</p> : null}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAuthPrompt(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={authSubmitting}
              >
                {authSubmitting ? 'Signing in...' : 'Continue'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
