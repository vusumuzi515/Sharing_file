import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getDownloadUrl, getPreviewUrl } from '../services/monitoringApi';
import { IconArrowLeft } from '../components/Icons';

const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);
const IFRAME_TYPES = new Set(['pdf', 'txt', 'text', 'csv', 'json']);
const WORD_TYPES = new Set(['doc', 'docx', 'rtf']);
const EXCEL_TYPES = new Set(['xls', 'xlsx', 'xlsm', 'csv']);
const POWERPOINT_TYPES = new Set(['ppt', 'pptx']);

function getExtension(name, fileType) {
  const fromType = String(fileType || '').trim().toLowerCase();
  if (fromType) return fromType;
  const fileName = String(name || '').trim().toLowerCase();
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

function getOpenWithLinks(ext, fileUrl) {
  if (!fileUrl) return [];
  const links = [];
  if (WORD_TYPES.has(ext)) {
    links.push({ label: 'Open in Microsoft Word', href: `ms-word:ofe|u|${fileUrl}` });
  }
  if (EXCEL_TYPES.has(ext)) {
    links.push({ label: 'Open in Microsoft Excel', href: `ms-excel:ofe|u|${fileUrl}` });
  }
  if (POWERPOINT_TYPES.has(ext)) {
    links.push({ label: 'Open in Microsoft PowerPoint', href: `ms-powerpoint:ofe|u|${fileUrl}` });
  }
  return links;
}

export default function FilePreview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileId = String(searchParams.get('fileId') || '').trim();
  const name = String(searchParams.get('name') || 'File').trim();
  const fileType = String(searchParams.get('type') || '').trim();
  const canDownload = searchParams.get('download') === '1';
  const department = String(searchParams.get('department') || '').trim();
  const project = String(searchParams.get('project') || '').trim();

  const ext = useMemo(() => getExtension(name, fileType), [name, fileType]);
  const previewUrl = fileId ? getPreviewUrl(fileId) : '';
  const downloadUrl = fileId ? getDownloadUrl(fileId) : '';
  const isImage = IMAGE_TYPES.has(ext);
  const isFramePreview = IFRAME_TYPES.has(ext);
  const openWithLinks = useMemo(() => getOpenWithLinks(ext, downloadUrl), [ext, downloadUrl]);

  const handleBackToDashboard = () => {
    if (department) {
      const q = new URLSearchParams({ department });
      if (project) q.set('project', project);
      navigate(`/site-files?${q.toString()}`);
      return;
    }
    navigate('/dashboard');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-h-[48px] min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={handleBackToDashboard}
            className="btn btn-secondary flex min-h-[48px] min-w-[48px] shrink-0 !p-0 sm:min-h-[44px] sm:min-w-[44px]"
            aria-label={department ? 'Back to department files' : 'Back to dashboard'}
          >
            <IconArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-slate-900">{name}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:justify-end">
          {canDownload && fileId ? (
            <a href={downloadUrl} download className="btn btn-primary">
              Download
            </a>
          ) : null}
        </div>
      </div>

      {!fileId ? (
        <div className="card rounded-2xl p-8 text-center text-sm text-slate-500">File not found.</div>
      ) : isImage ? (
        <div className="card overflow-hidden rounded-2xl bg-white/90 p-4 backdrop-blur-sm">
          <img src={previewUrl} alt={name} className="mx-auto max-h-[75vh] w-auto max-w-full object-contain" />
        </div>
      ) : isFramePreview ? (
        <div className="card overflow-hidden rounded-2xl bg-white/90 backdrop-blur-sm">
          <iframe src={previewUrl} title={name} className="h-[78vh] w-full border-0" />
        </div>
      ) : (
        <div className="card space-y-4 rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-500">Preview not available for this file.</p>
          {openWithLinks.length ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {openWithLinks.map((item) => (
                <a key={item.label} href={item.href} className="btn btn-secondary">
                  {item.label}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Use the Download button to open this file in your desktop application.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
