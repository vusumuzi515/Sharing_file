import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchOfficePreviewUrl,
  getDownloadUrl,
  getFilePreviewReturnPath,
  getPreviewUrl,
  uploadFile,
} from '../services/monitoringApi';
import { IconArrowLeft } from '../components/Icons';
import { usePortalSession } from '../hooks/usePortalSession';
import { useToast } from '../context/ToastContext';
import * as XLSX from 'xlsx';

const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);
const IFRAME_TYPES = new Set(['pdf', 'txt', 'text', 'csv', 'json']);
/** Types we can load as text and save back without opening desktop download dialog first. */
const BROWSER_TEXT_EDIT_TYPES = new Set(['txt', 'text', 'csv', 'json']);
const WORD_TYPES = new Set(['doc', 'docx', 'rtf']);
const EXCEL_TYPES = new Set(['xls', 'xlsx', 'xlsm', 'csv']);
const POWERPOINT_TYPES = new Set(['ppt', 'pptx']);
/** Excel workbooks editable in the dashboard (SheetJS). */
const BROWSER_SHEET_EDIT_TYPES = new Set(['xlsx', 'xls']);
/** Word/PowerPoint — Office Online embed (view; full edit uses desktop). */
const OFFICE_EMBED_TYPES = new Set(['doc', 'docx', 'ppt', 'pptx']);

const MAX_BROWSER_SHEET_ROWS = 500;
const MAX_BROWSER_SHEET_COLS = 78;

function padSheetGrid(data, minRows = 12, minCols = 8) {
  const rows = Math.max(minRows, data?.length || 0);
  let cols = minCols;
  for (const row of data || []) {
    cols = Math.max(cols, Array.isArray(row) ? row.length : 0);
  }
  const out = [];
  for (let r = 0; r < rows; r++) {
    const src = Array.isArray(data?.[r]) ? [...data[r]] : [];
    while (src.length < cols) src.push('');
    out.push(src.map((c) => (c == null ? '' : String(c))));
  }
  return out;
}

function getExtension(name, fileType) {
  const fromType = String(fileType || '').trim().toLowerCase();
  if (fromType) return fromType;
  const fileName = String(name || '').trim().toLowerCase();
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

function isSafeDesktopHref(href) {
  const s = String(href || '').trim();
  return (
    s.length > 0 &&
    s.length < 8192 &&
    !/\s/.test(s) &&
    !/^javascript:/i.test(s) &&
    !/^data:/i.test(s) &&
    /^[a-z][a-z0-9+.-]*:/i.test(s)
  );
}

function getOfficeDesktopLinks(ext, fileUrl, canEdit) {
  if (!fileUrl) return [];
  const links = [];
  if (WORD_TYPES.has(ext)) {
    links.push({
      label: canEdit ? 'Edit in Word (from server)' : 'Open in Word (from server)',
      href: `ms-word:ofe|u|${fileUrl}`,
    });
  }
  if (EXCEL_TYPES.has(ext)) {
    links.push({
      label: canEdit ? 'Edit in Excel (from server)' : 'Open in Excel (from server)',
      href: `ms-excel:ofe|u|${fileUrl}`,
    });
  }
  if (POWERPOINT_TYPES.has(ext)) {
    links.push({
      label: canEdit ? 'Edit in PowerPoint (from server)' : 'Open in PowerPoint (from server)',
      href: `ms-powerpoint:ofe|u|${fileUrl}`,
    });
  }
  return links;
}

export default function FilePreview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const { data: portalSession } = usePortalSession();
  const fileId = String(searchParams.get('fileId') || '').trim();
  const name = String(searchParams.get('name') || 'File').trim();
  const fileType = String(searchParams.get('type') || '').trim();
  const canDownload = searchParams.get('download') === '1';
  const canEdit = searchParams.get('edit') === '1';
  const department = String(searchParams.get('department') || '').trim();
  const project = String(searchParams.get('project') || '').trim();
  const serverFileId = String(searchParams.get('serverFileId') || '').trim();

  const ext = useMemo(() => getExtension(name, fileType), [name, fileType]);
  const previewUrl = fileId ? getPreviewUrl(fileId, { department, project }) : '';
  const downloadUrl = fileId ? getDownloadUrl(fileId, { department, project }) : '';
  const isImage = IMAGE_TYPES.has(ext);
  const isFramePreview = IFRAME_TYPES.has(ext);
  const canUpload = Boolean(portalSession?.capabilities?.upload);

  const inlineBrowserEditable =
    Boolean(fileId) &&
    BROWSER_TEXT_EDIT_TYPES.has(ext) &&
    canEdit &&
    canDownload &&
    canUpload &&
    Boolean(department);

  const spreadsheetBrowserEditable =
    Boolean(fileId) &&
    BROWSER_SHEET_EDIT_TYPES.has(ext) &&
    canEdit &&
    canDownload &&
    canUpload &&
    Boolean(department);

  const showOfficeEmbed =
    Boolean(fileId) &&
    OFFICE_EMBED_TYPES.has(ext) &&
    canDownload &&
    !spreadsheetBrowserEditable;

  const absoluteDownloadUrl = useMemo(() => {
    if (!downloadUrl) return '';
    try {
      return new URL(downloadUrl, window.location.origin).href;
    } catch {
      return downloadUrl;
    }
  }, [downloadUrl]);

  const workbookRef = useRef(null);
  const [editorBody, setEditorBody] = useState('');
  const [baselineBody, setBaselineBody] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [saving, setSaving] = useState(false);
  const [browserMode, setBrowserMode] = useState(() => (inlineBrowserEditable ? 'edit' : 'view'));
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [gridData, setGridData] = useState([]);
  const [baselineGridJson, setBaselineGridJson] = useState('');
  const [spreadsheetLoading, setSpreadsheetLoading] = useState(false);
  const [spreadsheetError, setSpreadsheetError] = useState('');
  const [spreadsheetSaving, setSpreadsheetSaving] = useState(false);
  const [officePanelMode, setOfficePanelMode] = useState('online');
  const [officeEmbedViewerSrc, setOfficeEmbedViewerSrc] = useState('');
  const [officeEmbedError, setOfficeEmbedError] = useState('');

  useEffect(() => {
    if (inlineBrowserEditable) setBrowserMode((m) => (m === 'view' ? 'edit' : m));
  }, [inlineBrowserEditable]);

  useEffect(() => {
    let cancelled = false;
    setOfficeEmbedViewerSrc('');
    setOfficeEmbedError('');
    if (!showOfficeEmbed || !fileId) return undefined;

    fetchOfficePreviewUrl({ fileId, department, project, serverFileId })
      .then((data) => {
        if (cancelled) return;
        const publicUrl = data?.url || absoluteDownloadUrl;
        setOfficeEmbedViewerSrc(
          publicUrl ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}` : '',
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setOfficeEmbedError(e?.message || 'Could not prepare Office Online preview.');
        if (absoluteDownloadUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(absoluteDownloadUrl)) {
          setOfficeEmbedViewerSrc(
            `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteDownloadUrl)}`,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [absoluteDownloadUrl, department, fileId, project, serverFileId, showOfficeEmbed]);

  const loadEditorText = useCallback(async () => {
    if (!inlineBrowserEditable || !previewUrl) return;
    setEditorError('');
    setEditorLoading(true);
    try {
      const res = await fetch(previewUrl);
      if (!res.ok) throw new Error(`Could not load file (${res.status})`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 4 * 1024 * 1024) {
        throw new Error('File is too large to edit in the browser (max ~4 MB). Use Excel or Download.');
      }
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      setEditorBody(text);
      setBaselineBody(text);
    } catch (e) {
      setEditorError(e?.message || 'Could not load file for editing.');
    } finally {
      setEditorLoading(false);
    }
  }, [inlineBrowserEditable, previewUrl]);

  useEffect(() => {
    if (browserMode !== 'edit' || !inlineBrowserEditable) return;
    loadEditorText();
  }, [browserMode, inlineBrowserEditable, loadEditorText]);

  const discardChanges = () => {
    setEditorBody(baselineBody);
    showToast('Reverted to last loaded version.');
  };

  const handleSaveToServer = async () => {
    if (!department || saving) return;
    const mime =
      ext === 'json' ? 'application/json' : ext === 'csv' ? 'text/csv' : 'text/plain; charset=utf-8';
    const blob = new Blob([editorBody], { type: mime });
    const safeName = name.includes('.') ? name : `${name}.${ext}`;
    const file = new File([blob], safeName, { type: mime });
    setSaving(true);
    setEditorError('');
    try {
      await uploadFile(file, department, project || 'General');
      setBaselineBody(editorBody);
      await queryClient.invalidateQueries({ queryKey: ['files'] });
      showToast('Saved — file updated on the server. Use Refresh on the file list if it is already open.');
    } catch (e) {
      const msg = e?.message || 'Save failed.';
      setEditorError(msg);
      showToast(msg);
    } finally {
      setSaving(false);
    }
  };

  const dirty = editorBody !== baselineBody;

  const flushGridIntoWorkbook = useCallback(() => {
    const wb = workbookRef.current;
    if (!wb || !sheetNames.length) return;
    const sn = sheetNames[activeSheetIndex];
    if (!sn) return;
    wb.Sheets[sn] = XLSX.utils.aoa_to_sheet(gridData);
  }, [sheetNames, activeSheetIndex, gridData]);

  const loadSpreadsheet = useCallback(async () => {
    if (!spreadsheetBrowserEditable || !downloadUrl) return;
    setSpreadsheetError('');
    setSpreadsheetLoading(true);
    workbookRef.current = null;
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`Could not load workbook (${res.status})`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 12 * 1024 * 1024) {
        throw new Error('Workbook is too large for browser editing (max ~12 MB). Use Excel from the server.');
      }
      const wb = XLSX.read(buf, { type: 'array' });
      const names = wb.SheetNames?.length ? [...wb.SheetNames] : [];
      if (!names.length) throw new Error('No sheets found in this workbook.');
      workbookRef.current = wb;
      setSheetNames(names);
      setActiveSheetIndex(0);
      const ws0 = wb.Sheets[names[0]];
      const raw = XLSX.utils.sheet_to_json(ws0, { header: 1, defval: '', raw: false });
      if (
        raw.length > MAX_BROWSER_SHEET_ROWS ||
        raw.some((row) => Array.isArray(row) && row.length > MAX_BROWSER_SHEET_COLS)
      ) {
        throw new Error(
          `This workbook is too large for browser editing (limit ${MAX_BROWSER_SHEET_ROWS} rows × ${MAX_BROWSER_SHEET_COLS} columns). Use Excel from the server.`,
        );
      }
      const padded = padSheetGrid(raw);
      setGridData(padded);
      setBaselineGridJson(JSON.stringify(padded));
    } catch (e) {
      setSpreadsheetError(e?.message || 'Could not load spreadsheet.');
      workbookRef.current = null;
      setSheetNames([]);
      setGridData([]);
      setBaselineGridJson('');
    } finally {
      setSpreadsheetLoading(false);
    }
  }, [spreadsheetBrowserEditable, downloadUrl]);

  useEffect(() => {
    if (!spreadsheetBrowserEditable) return;
    loadSpreadsheet();
  }, [spreadsheetBrowserEditable, loadSpreadsheet]);

  const sheetDirty = JSON.stringify(gridData) !== baselineGridJson;

  const switchSpreadsheetSheet = (nextIdx) => {
    if (nextIdx === activeSheetIndex || nextIdx < 0 || nextIdx >= sheetNames.length) return;
    flushGridIntoWorkbook();
    const wb = workbookRef.current;
    if (!wb || !sheetNames[nextIdx]) return;
    const ws = wb.Sheets[sheetNames[nextIdx]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (
      raw.length > MAX_BROWSER_SHEET_ROWS ||
      raw.some((row) => Array.isArray(row) && row.length > MAX_BROWSER_SHEET_COLS)
    ) {
      showToast(`Sheet "${sheetNames[nextIdx]}" is too large to edit here.`);
      return;
    }
    const padded = padSheetGrid(raw);
    setActiveSheetIndex(nextIdx);
    setGridData(padded);
    setBaselineGridJson(JSON.stringify(padded));
  };

  const discardSpreadsheetChanges = () => {
    if (!baselineGridJson) {
      loadSpreadsheet();
      return;
    }
    try {
      const parsed = JSON.parse(baselineGridJson);
      if (Array.isArray(parsed)) {
        setGridData(parsed);
        showToast('Reverted to last loaded version.');
      } else {
        loadSpreadsheet();
      }
    } catch {
      loadSpreadsheet();
    }
  };

  const saveSpreadsheetToServer = async () => {
    if (!department || spreadsheetSaving) return;
    const wb = workbookRef.current;
    if (!wb || !sheetNames.length) return;
    flushGridIntoWorkbook();
    setSpreadsheetSaving(true);
    setSpreadsheetError('');
    try {
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      let safeName = name.includes('.') ? name : `${name}.${ext}`;
      if (/\.xls$/i.test(safeName)) safeName = safeName.replace(/\.xls$/i, '.xlsx');
      const file = new File([blob], safeName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await uploadFile(file, department, project || 'General');
      await queryClient.invalidateQueries({ queryKey: ['files'] });
      await loadSpreadsheet();
      showToast('Spreadsheet saved to the server.');
    } catch (e) {
      const msg = e?.message || 'Save failed.';
      setSpreadsheetError(msg);
      showToast(msg);
    } finally {
      setSpreadsheetSaving(false);
    }
  };

  const updateSheetCell = (r, c, value) => {
    setGridData((prev) => {
      const next = prev.map((row) => [...row]);
      while (next.length <= r) next.push([]);
      while (next[r].length <= c) next[r].push('');
      next[r] = [...next[r]];
      next[r][c] = value;
      return next;
    });
  };

  const officeDesktopLinks = useMemo(
    () => (canDownload ? getOfficeDesktopLinks(ext, downloadUrl, canEdit) : []),
    [ext, downloadUrl, canDownload, canEdit],
  );

  const configuredDesktopLinks = useMemo(() => {
    if (!canEdit || !canDownload || !downloadUrl) return [];
    const rows = portalSession?.portalPolicy?.desktopEditHandlers?.[ext] || [];
    return rows
      .map(({ label, hrefTemplate }) => {
        const href = String(hrefTemplate || '').replace(
          /\{downloadUrl\}/gi,
          encodeURIComponent(downloadUrl),
        );
        return { label: String(label || '').trim(), href };
      })
      .filter((item) => item.label && isSafeDesktopHref(item.href));
  }, [portalSession, canEdit, canDownload, downloadUrl, ext]);

  const desktopLaunchCount = configuredDesktopLinks.length + officeDesktopLinks.length;

  const showEditHint =
    Boolean(fileId) &&
    canEdit &&
    canDownload &&
    (isFramePreview || isImage) &&
    !(inlineBrowserEditable && browserMode === 'edit');

  const handleBackToDashboard = () => {
    navigate(getFilePreviewReturnPath(`?${searchParams.toString()}`));
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-3 mb-2 flex flex-col gap-3 border-b border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-slate-900">{name}</h1>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end sm:gap-3">
            {configuredDesktopLinks.map((item) => (
              <a key={`${item.label}-${item.href}`} href={item.href} className="btn btn-primary whitespace-nowrap">
                {item.label}
              </a>
            ))}
            {officeDesktopLinks.map((item) => (
              <a key={item.label} href={item.href} className="btn btn-primary whitespace-nowrap">
                {item.label}
              </a>
            ))}
            <button
              type="button"
              onClick={handleBackToDashboard}
              className="btn flex min-h-[48px] shrink-0 items-center gap-2 border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:ring-slate-300 sm:min-h-[44px]"
              aria-label="Back"
            >
              <IconArrowLeft className="h-5 w-5 shrink-0 text-slate-900" />
              <span>Back</span>
            </button>
            {canDownload && fileId ? (
              <a
                href={downloadUrl}
                download
                className={`btn whitespace-nowrap ${desktopLaunchCount || inlineBrowserEditable || spreadsheetBrowserEditable ? 'btn-secondary' : 'btn-primary'}`}
              >
                Download copy
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {!fileId ? (
        <div className="card rounded-2xl p-8 text-center text-sm text-slate-500">File not found.</div>
      ) : isImage ? (
        <div className="space-y-3">
          <div className="card overflow-hidden rounded-2xl bg-white/90 p-4 backdrop-blur-sm">
            <img src={previewUrl} alt={name} className="mx-auto max-h-[75vh] w-auto max-w-full object-contain" />
          </div>
          {showEditHint ? (
            <p className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600">
              Images open read-only here. Download the file to edit it on your computer, then upload the updated version
              from your department folder if your account allows uploads.
            </p>
          ) : null}
        </div>
      ) : isFramePreview ? (
        <div className="space-y-3">
          {inlineBrowserEditable ? (
            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white/90 p-2 shadow-sm">
              <button
                type="button"
                className={`btn min-h-[40px] px-4 text-sm ${browserMode === 'edit' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setBrowserMode('edit')}
              >
                Edit here (no download)
              </button>
              <button
                type="button"
                className={`btn min-h-[40px] px-4 text-sm ${browserMode === 'view' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setBrowserMode('view')}
              >
                Preview only
              </button>
            </div>
          ) : null}

          {inlineBrowserEditable && browserMode === 'edit' ? (
            <div className="card space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              {editorLoading ? (
                <p className="py-12 text-center text-sm text-slate-500">Loading file for editing…</p>
              ) : (
                <>
                  <textarea
                    value={editorBody}
                    onChange={(e) => setEditorBody(e.target.value)}
                    spellCheck={false}
                    className="input min-h-[65vh] w-full resize-y font-mono text-sm leading-relaxed"
                    aria-label="File contents"
                  />
                  {editorError ? <p className="text-sm text-amber-800">{editorError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary min-h-[44px]"
                      disabled={saving || !dirty}
                      onClick={handleSaveToServer}
                    >
                      {saving ? 'Saving…' : 'Save to server'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary min-h-[44px]"
                      disabled={saving || !dirty}
                      onClick={discardChanges}
                    >
                      Discard unsaved changes
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary min-h-[44px]"
                      disabled={saving || editorLoading}
                      onClick={() => loadEditorText()}
                    >
                      Reload from server
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Changes upload as the same file name and replace the server copy when your portal policy allows it.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="card overflow-hidden rounded-2xl bg-white/90 backdrop-blur-sm">
              <iframe src={previewUrl} title={name} className="h-[78vh] w-full border-0" />
            </div>
          )}
          {showEditHint ? (
            <p className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600">
              {ext === 'pdf' ? (
                <>
                  PDFs cannot be edited inside this browser view. Word, Excel, and PowerPoint can{' '}
                  <strong>open straight from the server</strong> via the buttons above—no need to download a copy first.
                  When your organisation adds a PDF desktop handler, it can use the same pattern.
                </>
              ) : inlineBrowserEditable ? (
                <>
                  Use <strong>Edit here</strong> to change text or CSV/JSON in the browser and save to the server, or{' '}
                  <strong>Preview only</strong> to view formatting. For spreadsheets you can also use Excel from the server.
                </>
              ) : (
                <>
                  Preview is read-only here. Use desktop shortcuts above where available—they open from the server without
                  saving a separate download first.
                </>
              )}
            </p>
          ) : null}
        </div>
      ) : spreadsheetBrowserEditable ? (
        <div className="space-y-3">
          <div className="card space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
            {spreadsheetLoading ? (
              <p className="py-12 text-center text-sm text-slate-500">Loading workbook…</p>
            ) : spreadsheetError ? (
              <p className="py-8 text-center text-sm text-amber-800">{spreadsheetError}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                  {sheetNames.map((sn, idx) => (
                    <button
                      key={sn}
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                        idx === activeSheetIndex
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      onClick={() => switchSpreadsheetSheet(idx)}
                    >
                      {sn}
                    </button>
                  ))}
                </div>
                <div className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200">
                  <table className="min-w-max border-collapse text-sm">
                    <tbody>
                      {gridData.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci} className="border border-slate-200 p-0 align-top">
                              <input
                                className="min-h-[32px] min-w-[72px] max-w-[220px] border-0 bg-white px-2 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30"
                                value={cell}
                                onChange={(e) => updateSheetCell(ri, ci, e.target.value)}
                                aria-label={`Cell row ${ri + 1} column ${ci + 1}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary min-h-[44px]"
                    disabled={spreadsheetSaving || !sheetDirty}
                    onClick={saveSpreadsheetToServer}
                  >
                    {spreadsheetSaving ? 'Saving…' : 'Save to server'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary min-h-[44px]"
                    disabled={spreadsheetSaving || !sheetDirty}
                    onClick={discardSpreadsheetChanges}
                  >
                    Discard changes
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary min-h-[44px]"
                    disabled={spreadsheetSaving || spreadsheetLoading}
                    onClick={() => loadSpreadsheet()}
                  >
                    Reload from server
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Simple grid editing—complex formulas and charts may not round-trip. Older .xls files are saved as .xlsx.
                  Use <strong>Edit in Excel (from the server)</strong> above for full Excel.
                </p>
              </>
            )}
          </div>
        </div>
      ) : showOfficeEmbed ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white/90 p-2 shadow-sm">
            <button
              type="button"
              className={`btn min-h-[40px] px-4 text-sm ${officePanelMode === 'online' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOfficePanelMode('online')}
            >
              View in browser (Office Online)
            </button>
            <button
              type="button"
              className={`btn min-h-[40px] px-4 text-sm ${officePanelMode === 'tips' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOfficePanelMode('tips')}
            >
              Editing options
            </button>
          </div>
          {officePanelMode === 'online' && officeEmbedViewerSrc ? (
            <>
              <div className="card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <iframe title={name} src={officeEmbedViewerSrc} className="h-[78vh] w-full border-0" />
              </div>
              <p className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600">
                Office Online may open read-only if Microsoft cannot reach your file URL. For full editing, use{' '}
                <strong>Edit in Word / PowerPoint (from the server)</strong> above.
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white/90 px-4 py-6 text-center text-sm text-slate-600">
              {officeEmbedError ? <p className="mb-3 text-amber-700">{officeEmbedError}</p> : null}
              <p className="mb-3">
                Native Word/PowerPoint editing inside this page needs Microsoft 365 or a document server such as
                OnlyOffice.
              </p>
              <p>
                Use <strong>Edit in Word</strong> or <strong>Edit in PowerPoint</strong> at the top—your desktop app opens
                the file from the server without saving a copy first.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="card space-y-4 rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-500">Preview not available for this file.</p>
          {desktopLaunchCount ? (
            <p className="text-sm text-slate-600">
              Use the <strong>Open / Edit</strong> buttons at the top to launch desktop software on your computer
              {canEdit ? ', save your changes, then Refresh on the file list and upload again if allowed.' : '.'}
            </p>
          ) : canDownload ? (
            <p className="text-xs text-slate-500">
              Use Download to open this file in your desktop application.
            </p>
          ) : (
            <p className="text-xs text-slate-500">You do not have permission to download this file.</p>
          )}
        </div>
      )}
    </div>
  );
}
