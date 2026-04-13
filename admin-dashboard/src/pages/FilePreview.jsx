import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getDownloadUrl, getPreviewUrl } from '../services/monitoringApi';

const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);
const IFRAME_TYPES = new Set(['pdf', 'txt', 'text', 'csv', 'json']);

function getExtension(name, fileType) {
  const fromType = String(fileType || '').trim().toLowerCase();
  if (fromType) return fromType;
  const fileName = String(name || '').trim().toLowerCase();
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

export default function FilePreview() {
  const [searchParams] = useSearchParams();
  const fileId = String(searchParams.get('fileId') || '').trim();
  const name = String(searchParams.get('name') || 'File').trim();
  const fileType = String(searchParams.get('type') || '').trim();
  const canDownload = searchParams.get('download') === '1';

  const ext = useMemo(() => getExtension(name, fileType), [name, fileType]);
  const previewUrl = fileId ? getPreviewUrl(fileId) : '';
  const downloadUrl = fileId ? getDownloadUrl(fileId) : '';
  const isImage = IMAGE_TYPES.has(ext);
  const isFramePreview = IFRAME_TYPES.has(ext);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-slate-900">{name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/site-files" className="btn btn-secondary">
            Back
          </Link>
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
        <div className="card rounded-2xl p-8 text-center text-sm text-slate-500">
          Preview not available for this file.
        </div>
      )}
    </div>
  );
}
