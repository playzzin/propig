'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import type { Config } from '@imgly/background-removal';
import { type PhotoAlbum, photoService } from '@/services/photoService';
import styled from 'styled-components';

type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'ico';
type InputFormat = OutputFormat | 'svg' | 'unknown';
type ConvertStatus = 'pending' | 'converting' | 'done' | 'error';
type NoticeTone = 'success' | 'error' | 'info';
type PresetId = 'balanced' | 'delivery' | 'photo' | 'transparent' | 'animated' | 'favicon' | 'portrait' | 'custom';
type DuplicatePolicy = 'rename' | 'skip';
type NamingMode = 'original' | 'prefixSuffix' | 'pattern';

interface ImageConverterProps {
  albums?: PhotoAlbum[];
  defaultAlbumId?: string | null;
  onAlbumsChanged?: () => void | Promise<void>;
  seedPhotos?: ImageConverterSeedPhoto[];
  seedKey?: string | null;
}

export interface ImageConverterSeedPhoto {
  id: string;
  url: string;
  fileName?: string;
  extension?: string;
  mimeType?: string;
  type?: 'image' | 'video';
  prompt?: string;
  sourceAlbumId?: string;
  albumTitle?: string;
}

interface ConvertOptions {
  format: OutputFormat;
  quality: number;
  maxWidth: number;
  maxHeight: number;
  stripMeta: boolean;
  flatten: boolean;
  background: string;
  removeBackground: boolean;
  preserveAnimation: boolean;
  icoSizes: number[];
  gifColors: number;
  gifDither: number;
  squareCrop: boolean;
  focalX: number;
  focalY: number;
}

interface ConvertFile {
  id: string;
  key: string;
  file: File;
  inputFormat: InputFormat;
  originalUrl: string;
  originalSize: number;
  originalW: number;
  originalH: number;
  status: ConvertStatus;
  error: string | null;
  notes: string[];
  resultBlob: Blob | null;
  resultUrl: string | null;
  resultSize: number | null;
  resultW: number | null;
  resultH: number | null;
  resultPages: number | null;
  resultFormat: OutputFormat | null;
  resultSignature: string | null;
  overrides: Partial<ConvertOptions>;
  customName: string;
}

interface NamingOptions {
  mode: NamingMode;
  prefix: string;
  suffix: string;
  pattern: string;
  duplicatePolicy: DuplicatePolicy;
}

interface SavedPreset {
  id: string;
  name: string;
  options: ConvertOptions;
  createdAt: string;
}

interface HistoryEntry {
  id: string;
  action: 'convert' | 'save';
  label: string;
  count: number;
  format: OutputFormat;
  originalBytes: number;
  resultBytes: number;
  albumTitle?: string;
  createdAt: string;
}

const DEFAULT_OPTIONS: ConvertOptions = {
  format: 'webp',
  quality: 84,
  maxWidth: 0,
  maxHeight: 0,
  stripMeta: true,
  flatten: false,
  background: '#ffffff',
  removeBackground: false,
  preserveAnimation: true,
  icoSizes: [16, 32, 48, 64],
  gifColors: 128,
  gifDither: 0.8,
  squareCrop: false,
  focalX: 50,
  focalY: 50,
};

const DEFAULT_NAMING: NamingOptions = {
  mode: 'original',
  prefix: '',
  suffix: '-converted',
  pattern: '{name}-{index}',
  duplicatePolicy: 'rename',
};

const PRESETS: Array<{ id: PresetId; label: string; desc: string; options: Partial<ConvertOptions> }> = [
  { id: 'balanced', label: 'Balanced WebP', desc: '운영 기본값', options: { format: 'webp', quality: 84, stripMeta: true, preserveAnimation: true } },
  { id: 'delivery', label: 'Delivery AVIF', desc: '배포 용량 우선', options: { format: 'avif', quality: 68, maxWidth: 2400, maxHeight: 2400, stripMeta: true, preserveAnimation: false } },
  { id: 'photo', label: 'Photo JPEG', desc: '사진/호환성 우선', options: { format: 'jpeg', quality: 90, maxWidth: 3200, maxHeight: 3200, stripMeta: true, flatten: true, background: '#ffffff', preserveAnimation: false } },
  { id: 'transparent', label: 'Transparent PNG', desc: '투명 UI 자산', options: { format: 'png', quality: 100, stripMeta: true, flatten: false, preserveAnimation: false } },
  { id: 'animated', label: 'Animated GIF', desc: '움직임 보존', options: { format: 'gif', maxWidth: 960, maxHeight: 960, stripMeta: true, preserveAnimation: true, gifColors: 128, gifDither: 0.8 } },
  { id: 'favicon', label: 'Favicon ICO', desc: '브랜드 패키지', options: { format: 'ico', stripMeta: true, preserveAnimation: false, icoSizes: [16, 32, 48, 64, 128] } },
  { id: 'portrait', label: 'Pro Portrait', desc: '배경 제거 인물용', options: { format: 'webp', quality: 90, removeBackground: true, stripMeta: true, flatten: false } },
];

const OUTPUTS: Array<{ format: OutputFormat; label: string }> = [
  { format: 'webp', label: 'WebP' },
  { format: 'avif', label: 'AVIF' },
  { format: 'jpeg', label: 'JPEG' },
  { format: 'png', label: 'PNG' },
  { format: 'gif', label: 'GIF' },
  { format: 'ico', label: 'ICO' },
];

const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const MAX_FILES = 80;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml,.ico,.cur';
const SAVED_PRESETS_KEY = 'propig.imageConverter.savedPresets';
const HISTORY_KEY = 'propig.imageConverter.history';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);

  @media (max-width: 720px) {
    height: auto;
    min-height: 100%;
    overflow: visible;
  }
`;

const Hero = styled.div`
  padding: 14px 20px;
  background: #0f172a;
  color: white;

  @media (max-width: 720px) {
    padding: 12px 14px;

    .studio-copy {
      display: none;
    }

    .studio-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      flex-basis: 100% !important;
    }
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr);
  min-height: 0;
  flex: 1;
  @media (max-width: 1120px) { grid-template-columns: 1fr; }

  @media (max-width: 720px) {
    display: flex;
    flex-direction: column;
    min-height: auto;
  }
`;

const Sidebar = styled.div`
  overflow-y: auto;
  padding: 14px;
  background: rgba(255,255,255,0.95);
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 14px;

  @media (max-width: 720px) {
    order: 2;
    padding: 12px;
    border-right: none;
  }
`;

const Panel = styled.div`
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 10px 24px rgba(15,23,42,0.04);
`;

const FieldLabel = styled.label`
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 8px;
`;

const FieldHint = styled.div`
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
`;

const AlbumSourceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 2px;
`;

const AlbumSourceTile = styled.button`
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 0;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.52;
  }

  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  span {
    position: absolute;
    left: 5px;
    right: 5px;
    bottom: 5px;
    padding: 3px 5px;
    border-radius: 6px;
    background: rgba(15, 23, 42, 0.72);
    color: white;
    font-size: 10px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;

  @media (max-width: 720px) {
    order: 1;
    overflow: visible;
  }
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: rgba(255,255,255,0.92);
  border-bottom: 1px solid #e2e8f0;

  @media (max-width: 720px) {
    padding: 12px;

    > button {
      flex: 1 1 calc(50% - 6px);
    }
  }
`;

const Button = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  border-radius: 12px;
  padding: 0 14px;
  border: 1px solid ${(p) => (p.$primary ? '#4f46e5' : p.$danger ? '#fecaca' : '#cbd5e1')};
  background: ${(p) => (p.$primary ? '#4f46e5' : p.$danger ? '#fff1f2' : 'white')};
  color: ${(p) => (p.$primary ? 'white' : p.$danger ? '#dc2626' : '#334155')};
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const DropZone = styled.div<{ $active?: boolean; $disabled?: boolean }>`
  margin: 18px;
  padding: 18px;
  border-radius: 20px;
  border: 1.5px dashed ${(p) => (p.$active ? '#4f46e5' : '#cbd5e1')};
  background: ${(p) => (p.$active ? '#eef2ff' : 'rgba(255,255,255,0.92)')};
  opacity: ${(p) => (p.$disabled ? 0.66 : 1)};
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'default')};

  @media (max-width: 720px) {
    margin: 12px;
    padding: 14px;
    border-radius: 16px;

    .dropzone-inner {
      grid-template-columns: 1fr !important;
    }

    .dropzone-actions {
      align-items: stretch !important;
      text-align: left !important;
    }
  }
`;

const Queue = styled.div`
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 0 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  @media (max-width: 720px) {
    padding: 0 12px 12px;
  }
`;

const Row = styled.div<{ $status: ConvertStatus }>`
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid ${(p) => (p.$status === 'done' ? '#bbf7d0' : p.$status === 'error' ? '#fecaca' : p.$status === 'converting' ? '#c7d2fe' : '#e2e8f0')};
  background: white;
  @media (max-width: 900px) { grid-template-columns: 72px minmax(0, 1fr); }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    padding: 12px;
  }
`;

const CheckerPreview = styled.div`
  background-color: #f8fafc;
  background-image:
    linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
    linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
    linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
`;

const CompareGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 900px) {
    grid-template-columns: 72px;
  }

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const CompareTile = styled(CheckerPreview)`
  position: relative;
  height: 96px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  @media (max-width: 900px) {
    height: 72px;
  }

  @media (max-width: 720px) {
    height: 118px;
  }
`;

const CompareLabel = styled.span`
  position: absolute;
  left: 6px;
  bottom: 6px;
  border-radius: 999px;
  padding: 3px 7px;
  background: rgba(15, 23, 42, 0.74);
  color: white;
  font-size: 10px;
  font-weight: 800;
`;

const TokenList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
`;

const Token = styled.div<{ $accent?: boolean; $danger?: boolean }>`
  padding: 5px 9px;
  border-radius: 999px;
  background: ${(p) => (p.$danger ? '#fff1f2' : p.$accent ? '#ecfdf5' : '#f8fafc')};
  border: 1px solid ${(p) => (p.$danger ? '#fecaca' : p.$accent ? '#bbf7d0' : '#e2e8f0')};
  color: ${(p) => (p.$danger ? '#b91c1c' : p.$accent ? '#166534' : '#334155')};
`;

const RowActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;

  @media (max-width: 720px) {
    justify-content: stretch;

    > button {
      flex: 1 1 calc(50% - 6px);
    }
  }
`;

const Inspector = styled.details`
  margin-top: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;

  summary {
    cursor: pointer;
    padding: 9px 11px;
    color: #334155;
    font-size: 12.5px;
    font-weight: 800;
  }

  summary:focus-visible {
    outline: 3px solid rgba(79, 70, 229, 0.2);
    outline-offset: 2px;
  }
`;

const InspectorBody = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 0 11px 11px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const FieldInput = styled.input`
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12.5px;
  background: white;
`;

const FieldSelect = styled.select`
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12.5px;
  background: white;
`;

const MiniList = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 12px;
`;

const MiniItem = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
`;

const NoticeBar = styled.div<{ $tone: NoticeTone }>`
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1000;
  max-width: 420px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid ${(p) => (p.$tone === 'success' ? '#86efac' : p.$tone === 'error' ? '#fca5a5' : '#c7d2fe')};
  background: ${(p) => (p.$tone === 'success' ? '#f0fdf4' : p.$tone === 'error' ? '#fff1f2' : '#eef2ff')};
  color: ${(p) => (p.$tone === 'success' ? '#166534' : p.$tone === 'error' ? '#b91c1c' : '#3730a3')};
  font-size: 0.84rem;
  font-weight: 700;
`;

function fileKey(file: File) {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDelta(originalBytes: number, resultBytes: number | null) {
  if (!resultBytes || originalBytes <= 0) return null;
  const delta = Math.round(((originalBytes - resultBytes) / originalBytes) * 100);
  return delta >= 0 ? `-${delta}%` : `+${Math.abs(delta)}%`;
}

function estimateOutputBytes(totalBytes: number, options: ConvertOptions) {
  if (totalBytes <= 0) return 0;
  const qualityFactor = clamp(options.quality, 1, 100) / 100;
  const formatBase: Record<OutputFormat, number> = {
    avif: 0.34,
    gif: 0.82,
    ico: 0.72,
    jpeg: 0.55,
    png: 0.95,
    webp: 0.42,
  };
  const resizeFactor = options.maxWidth || options.maxHeight ? 0.72 : 1;
  const alphaFactor = options.flatten || options.format === 'jpeg' ? 0.92 : 1;
  return Math.max(1, Math.round(totalBytes * formatBase[options.format] * (0.72 + qualityFactor * 0.42) * resizeFactor * alphaFactor));
}

function mergeOptions(base: ConvertOptions, overrides: Partial<ConvertOptions>): ConvertOptions {
  const cleanedOverrides = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)) as Partial<ConvertOptions>;
  const next = { ...base, ...cleanedOverrides };
  return {
    ...next,
    quality: clamp(Number(next.quality) || DEFAULT_OPTIONS.quality, 1, 100),
    maxWidth: clamp(Number(next.maxWidth) || 0, 0, 12000),
    maxHeight: clamp(Number(next.maxHeight) || 0, 0, 12000),
    gifColors: clamp(Number(next.gifColors) || DEFAULT_OPTIONS.gifColors, 32, 256),
    gifDither: clamp(Number(next.gifDither) || DEFAULT_OPTIONS.gifDither, 0, 1),
    focalX: clamp(Number(next.focalX) || 50, 0, 100),
    focalY: clamp(Number(next.focalY) || 50, 0, 100),
    flatten: next.format === 'jpeg' ? true : Boolean(next.flatten),
    preserveAnimation: (next.format === 'gif' || next.format === 'webp') && Boolean(next.preserveAnimation),
  };
}

function fileStem(name: string) {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}

function sanitizeFileStem(value: string, fallback: string) {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return cleaned || fallback;
}

function applyNamingPattern(item: ConvertFile, index: number, format: OutputFormat, naming: NamingOptions) {
  const base = sanitizeFileStem(item.customName || fileStem(item.file.name), fileStem(item.file.name) || 'image');
  if (naming.mode === 'prefixSuffix') {
    return sanitizeFileStem(`${naming.prefix}${base}${naming.suffix}`, base);
  }
  if (naming.mode === 'pattern') {
    return sanitizeFileStem(
      naming.pattern
        .replaceAll('{name}', base)
        .replaceAll('{index}', String(index + 1).padStart(2, '0'))
        .replaceAll('{format}', format),
      base
    );
  }
  return base;
}

function dedupeFileName(fileName: string, usedNames: Set<string>) {
  const extensionIndex = fileName.lastIndexOf('.');
  const stem = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : '';
  let candidate = fileName;
  let count = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem}-${count}${extension}`;
    count += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function buildOutputFileName(item: ConvertFile, index: number, format: OutputFormat, naming: NamingOptions, usedNames?: Set<string>) {
  const stem = applyNamingPattern(item, index, format, naming);
  const fileName = `${stem}.${getOutputExtension(format)}`;
  return usedNames ? dedupeFileName(fileName, usedNames) : fileName;
}

function resetConvertedResult(item: ConvertFile): ConvertFile {
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
  return {
    ...item,
    status: 'pending',
    error: null,
    resultBlob: null,
    resultUrl: null,
    resultSize: null,
    resultW: null,
    resultH: null,
    resultPages: null,
    resultFormat: null,
    resultSignature: null,
  };
}

function getInputFormat(file: File): InputFormat {
  const name = file.name.toLowerCase();
  if (file.type === 'image/avif' || name.endsWith('.avif')) return 'avif';
  if (file.type === 'image/gif' || name.endsWith('.gif')) return 'gif';
  if (file.type === 'image/vnd.microsoft.icon' || file.type === 'image/x-icon' || name.endsWith('.ico') || name.endsWith('.cur')) return 'ico';
  if (file.type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpeg';
  if (file.type === 'image/png' || name.endsWith('.png')) return 'png';
  if (file.type === 'image/webp' || name.endsWith('.webp')) return 'webp';
  if (file.type === 'image/svg+xml' || name.endsWith('.svg')) return 'svg';
  return 'unknown';
}

function getOutputExtension(format: OutputFormat) {
  return format === 'jpeg' ? 'jpg' : format;
}

function getOutputMime(format: OutputFormat) {
  switch (format) {
    case 'avif': return 'image/avif';
    case 'gif': return 'image/gif';
    case 'ico': return 'image/x-icon';
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
  }
}

function replaceExtension(name: string, extension: string) {
  return `${name.replace(/\.[^.]+$/, '')}.${extension}`;
}

function getNameExtension(name?: string) {
  const match = name?.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1];
}

function getMimeFromExtension(extension?: string) {
  switch (extension?.toLowerCase()) {
    case 'avif': return 'image/avif';
    case 'gif': return 'image/gif';
    case 'ico': return 'image/x-icon';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    default: return '';
  }
}

function getExtensionFromMime(mimeType?: string) {
  switch (mimeType?.toLowerCase()) {
    case 'image/avif': return 'avif';
    case 'image/gif': return 'gif';
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon': return 'ico';
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/svg+xml': return 'svg';
    case 'image/webp': return 'webp';
    default: return '';
  }
}

function isVideoPhoto(photo: ImageConverterSeedPhoto) {
  return photo.type === 'video' || photo.extension?.toLowerCase() === 'mp4' || photo.mimeType?.startsWith('video/') || photo.url.includes('.mp4');
}

function buildAlbumPhotoFileName(photo: ImageConverterSeedPhoto, mimeType?: string) {
  const fallbackName = `album-photo-${photo.id}`;
  const rawName = photo.fileName || fallbackName;
  const cleanName = rawName.split('?')[0].replace(/[\\/:*?"<>|]+/g, '-').trim() || fallbackName;
  const currentExtension = getNameExtension(cleanName);
  if (currentExtension) return cleanName;

  const extension = photo.extension || getExtensionFromMime(photo.mimeType || mimeType) || 'jpg';
  return `${cleanName}.${extension}`;
}

async function fetchPhotoAsFile(photo: ImageConverterSeedPhoto) {
  if (isVideoPhoto(photo)) {
    throw new Error(`${photo.fileName || photo.id}은(는) 이미지 변환 대상이 아닙니다.`);
  }

  const response = await fetch('/api/fetch-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: photo.url, fileName: photo.fileName }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `${photo.fileName || photo.id}을(를) 불러오지 못했습니다.`);
  }

  const blob = await response.blob();
  const fileName = buildAlbumPhotoFileName(photo, blob.type);
  const mimeType = photo.mimeType || blob.type || getMimeFromExtension(getNameExtension(fileName)) || 'image/jpeg';

  if (!mimeType.startsWith('image/')) {
    throw new Error(`${fileName}은(는) 이미지 파일이 아닙니다.`);
  }

  return new File([blob], fileName, { type: mimeType, lastModified: Date.now() });
}

function revokeItem(item: ConvertFile) {
  URL.revokeObjectURL(item.originalUrl);
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
}

async function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    image.src = url;
  });
}

async function getPreviewSize(url: string) {
  try {
    const image = await loadImage(url);
    return { width: image.naturalWidth || 0, height: image.naturalHeight || 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

async function drawToCanvas(url: string, options: { maxWidth?: number; maxHeight?: number; square?: number; background?: string }) {
  const image = await loadImage(url);
  let width = image.naturalWidth || 1;
  let height = image.naturalHeight || 1;

  if (options.square) {
    const canvas = document.createElement('canvas');
    canvas.width = options.square;
    canvas.height = options.square;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('캔버스를 초기화하지 못했습니다.');
    if (options.background) {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, options.square, options.square);
    }
    const ratio = Math.min(options.square / width, options.square / height);
    const drawWidth = Math.max(1, Math.round(width * ratio));
    const drawHeight = Math.max(1, Math.round(height * ratio));
    ctx.drawImage(image, Math.round((options.square - drawWidth) / 2), Math.round((options.square - drawHeight) / 2), drawWidth, drawHeight);
    return { canvas, width: options.square, height: options.square };
  }

  if (options.maxWidth && width > options.maxWidth) {
    height = Math.max(1, Math.round((height * options.maxWidth) / width));
    width = options.maxWidth;
  }
  if (options.maxHeight && height > options.maxHeight) {
    width = Math.max(1, Math.round((width * options.maxHeight) / height));
    height = options.maxHeight;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 초기화하지 못했습니다.');
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(image, 0, 0, width, height);
  return { canvas, width, height };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('브라우저 캔버스에서 파일을 만들지 못했습니다.'))), mimeType);
  });
}

async function buildIco(url: string, sizes: number[], background?: string) {
  const entries: Array<{ size: number; data: Uint8Array }> = [];
  for (const size of sizes) {
    const { canvas } = await drawToCanvas(url, { square: size, background });
    const pngBlob = await canvasToBlob(canvas, 'image/png');
    const buffer = await pngBlob.arrayBuffer();
    entries.push({ size, data: new Uint8Array(buffer) });
  }
  const count = entries.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const offsets = entries.map((entry) => {
    const current = offset;
    offset += entry.data.length;
    return current;
  });
  const bytes = new Uint8Array(offset);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, count, true);
  entries.forEach((entry, index) => {
    const base = 6 + index * 16;
    view.setUint8(base, entry.size >= 256 ? 0 : entry.size);
    view.setUint8(base + 1, entry.size >= 256 ? 0 : entry.size);
    view.setUint16(base + 4, 1, true);
    view.setUint16(base + 6, 32, true);
    view.setUint32(base + 8, entry.data.length, true);
    view.setUint32(base + 12, offsets[index], true);
  });
  let position = headerSize;
  entries.forEach((entry) => {
    bytes.set(entry.data, position);
    position += entry.data.length;
  });
  return new Blob([bytes], { type: 'image/x-icon' });
}

function buildSignature(options: ConvertOptions) {
  const normalized = mergeOptions(DEFAULT_OPTIONS, options);
  return JSON.stringify({
    ...normalized,
    flatten: normalized.format === 'jpeg' ? true : normalized.flatten,
    preserveAnimation: (normalized.format === 'gif' || normalized.format === 'webp') && normalized.preserveAnimation,
    icoSizes: [...normalized.icoSizes].sort((a, b) => a - b),
    focalX: Math.round(normalized.focalX),
    focalY: Math.round(normalized.focalY),
  });
}

function readSavedPresets(): SavedPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_PRESETS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 12) as SavedPreset[] : [];
  } catch {
    return [];
  }
}

function readHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 10) as HistoryEntry[] : [];
  } catch {
    return [];
  }
}

function writeSavedPresets(presets: SavedPreset[]) {
  window.localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(presets.slice(0, 12)));
}

function writeHistory(entries: HistoryEntry[]) {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 10)));
}

function buildNotes(format: InputFormat) {
  const notes: string[] = [];
  if (format === 'svg') notes.push('SVG는 입력 전용이며 래스터 결과물로 출력됩니다.');
  if (format === 'ico') notes.push('ICO 입력은 PNG로 정규화 후 서버 변환됩니다.');
  if (format === 'gif' || format === 'webp') notes.push('애니메이션은 GIF/WebP 출력에서만 유지됩니다.');
  return notes;
}

async function convertItem(item: ConvertFile, options: ConvertOptions, signal: AbortSignal, onProgress?: (msg: string) => void) {
  let currentFile: File | Blob = item.file;
  let currentUrl = item.originalUrl;

  // 1. AI 배경 제거 (Preprocessing)
  if (options.removeBackground) {
    onProgress?.('AI 배경 분석 중…');
    try {
      const config: Config = {
        progress: (msg: string, current: number, total: number) => {
          const percent = total > 0 ? Math.round((current / total) * 100) : 0;
          onProgress?.(`${msg}… ${percent}%`);
        },
        output: { format: 'image/png' },
      };
      const backgroundRemovalModule = await import('@imgly/background-removal');
      const resultBlob = await backgroundRemovalModule.removeBackground(currentUrl, config);
      currentFile = resultBlob;
      currentUrl = URL.createObjectURL(resultBlob);
    } catch (error) {
      console.error('Background removal failed:', error);
      throw new Error('AI 배경 제거에 실패했습니다. (모델 로딩 또는 메모리 부족)');
    }
  }

  try {
    if (options.format === 'ico') {
      const sizes = options.icoSizes.length > 0 ? [...options.icoSizes].sort((a, b) => a - b) : [16, 32, 48, 64];
      const blob = await buildIco(currentUrl, sizes, options.flatten || item.inputFormat === 'jpeg' ? options.background : undefined);
      return { blob, width: Math.max(...sizes), height: Math.max(...sizes), pages: 1 };
    }

    const uploadFile = item.inputFormat === 'ico' || options.removeBackground ? (currentFile instanceof File ? currentFile : new File([currentFile], replaceExtension(item.file.name, 'png'), { type: 'image/png' })) : item.file;
    
    const formData = new FormData();
    formData.append('file', uploadFile, uploadFile.name);
    formData.append('format', options.format);
    formData.append('quality', String(options.quality));
    formData.append('maxWidth', String(options.maxWidth));
    formData.append('maxHeight', String(options.maxHeight));
    formData.append('stripMeta', String(options.stripMeta));
    formData.append('flatten', String(options.format === 'jpeg' ? true : options.flatten));
    formData.append('background', options.background);
    formData.append('preserveAnimation', String((options.format === 'gif' || options.format === 'webp') && options.preserveAnimation));
    formData.append('gifColors', String(options.gifColors));
    formData.append('gifDither', String(options.gifDither));
    formData.append('squareCrop', String(options.squareCrop));
    formData.append('focalX', String(options.focalX));
    formData.append('focalY', String(options.focalY));

    const response = await fetch('/api/convert-image', { method: 'POST', body: formData, signal });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? '이미지 변환 API가 실패했습니다.');
    }
    const blob = await response.blob();
    return {
      blob,
      width: Number(response.headers.get('X-Image-Width') ?? 0) || null,
      height: Number(response.headers.get('X-Image-Height') ?? 0) || null,
      pages: Number(response.headers.get('X-Image-Pages') ?? 1) || 1,
    };
  } finally {
    if (currentUrl !== item.originalUrl) URL.revokeObjectURL(currentUrl);
  }
}

export default function ImageConverter({ albums = [], defaultAlbumId = null, onAlbumsChanged, seedPhotos = [], seedKey = null }: ImageConverterProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<ConvertFile[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const lastSeedKeyRef = useRef<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const previousSignatureRef = useRef(buildSignature(DEFAULT_OPTIONS));
  const savedPresetsRef = useRef<SavedPreset[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);

  const [files, setFiles] = useState<ConvertFile[]>([]);
  const [options, setOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS);
  const [presetId, setPresetId] = useState<PresetId>('balanced');
  const [naming, setNaming] = useState<NamingOptions>(DEFAULT_NAMING);
  const [presetName, setPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => readSavedPresets());
  const [history, setHistory] = useState<HistoryEntry[]>(() => readHistory());
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [destinationAlbumId, setDestinationAlbumId] = useState('');
  const [sourceAlbumId, setSourceAlbumId] = useState('');
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchProcessed, setBatchProcessed] = useState(0);

  const showNotice = useCallback((message: string, tone: NoticeTone = 'info') => {
    setNotice({ message, tone });
    if (noticeTimerRef.current != null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    savedPresetsRef.current = savedPresets;
  }, [savedPresets]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    if (albums.length === 0) {
      setDestinationAlbumId('');
      setSourceAlbumId('');
      return;
    }
    const preferred = defaultAlbumId && albums.some((album) => album.id === defaultAlbumId) ? defaultAlbumId : albums[0]?.id;
    setDestinationAlbumId((current) => (current && albums.some((album) => album.id === current) ? current : preferred ?? ''));
    setSourceAlbumId((current) => (current && albums.some((album) => album.id === current) ? current : preferred ?? ''));
  }, [albums, defaultAlbumId]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current != null) window.clearTimeout(noticeTimerRef.current);
      abortRef.current?.abort();
      filesRef.current.forEach(revokeItem);
    };
  }, []);

  const currentSignature = useMemo(() => buildSignature(options), [options]);

  useEffect(() => {
    if (previousSignatureRef.current === currentSignature) return;
    let resetCount = 0;
    setFiles((previous) =>
      previous.map((item) => {
        const itemSignature = buildSignature(mergeOptions(options, item.overrides));
        if (!item.resultSignature || item.resultSignature === itemSignature) return item;
        resetCount += 1;
        return resetConvertedResult(item);
      })
    );
    if (resetCount > 0) showNotice('설정이 변경되어 기존 결과를 다시 변환해야 합니다.', 'info');
    previousSignatureRef.current = currentSignature;
  }, [currentSignature, options, showNotice]);

  const doneItems = files.filter((item) => item.status === 'done' && item.resultBlob);
  const errorItems = files.filter((item) => item.status === 'error');
  const pendingItems = files.filter((item) => item.status === 'pending');
  const progress = batchTotal > 0 ? Math.round((batchProcessed / batchTotal) * 100) : 0;
  const totalOriginalBytes = files.reduce((sum, item) => sum + item.originalSize, 0);
  const totalResultBytes = doneItems.reduce((sum, item) => sum + (item.resultSize ?? 0), 0);
  const estimatedBytes = estimateOutputBytes(totalOriginalBytes, options);
  const destinationAlbum = useMemo(() => albums.find((album) => album.id === destinationAlbumId) ?? null, [albums, destinationAlbumId]);
  const sourceAlbum = useMemo(() => albums.find((album) => album.id === sourceAlbumId) ?? null, [albums, sourceAlbumId]);
  const sourceAlbumImages = useMemo(
    () =>
      (sourceAlbum?.photoItems ?? [])
        .filter((photo) => !isVideoPhoto(photo))
        .map((photo) => ({
          ...photo,
          sourceAlbumId: sourceAlbum?.id,
          albumTitle: sourceAlbum?.title,
        })),
    [sourceAlbum]
  );

  const insights = useMemo(() => {
    const next: string[] = [];
    if (files.some((item) => item.inputFormat === 'svg')) next.push('SVG는 진짜 벡터 SVG로 재출력하지 않고, 안정적으로 래스터 출력만 지원합니다.');
    if (files.some((item) => item.inputFormat === 'ico')) next.push('ICO 입력은 브라우저에서 PNG로 정규화한 뒤 서버 변환합니다.');
    if (files.some((item) => item.inputFormat === 'gif' || item.inputFormat === 'webp') && !(options.format === 'gif' || options.format === 'webp')) next.push('애니메이션 입력을 정적 포맷으로 바꾸면 첫 프레임 기준 결과가 생성됩니다.');
    if (options.format === 'jpeg') next.push(`JPEG는 배경색 ${options.background.toUpperCase()}로 합성됩니다.`);
    if (options.format === 'ico') next.push(`ICO는 ${[...options.icoSizes].sort((a, b) => a - b).join(', ')}px 패키지로 생성됩니다.`);
    if (options.squareCrop) next.push(`정사각형 크롭은 초점 ${options.focalX}:${options.focalY} 기준으로 적용됩니다.`);
    if (naming.duplicatePolicy === 'skip') next.push('앨범 저장 시 같은 파일명은 건너뜁니다.');
    return next;
  }, [files, naming.duplicatePolicy, options]);

  const markCustom = useCallback(() => setPresetId((current) => (current === 'custom' ? current : 'custom')), []);

  const updateOptions = useCallback((updater: (current: ConvertOptions) => ConvertOptions) => {
    markCustom();
    setOptions((current) => updater(current));
  }, [markCustom]);

  const addFiles = useCallback(async (incoming: File[]): Promise<number> => {
    const existing = new Set(filesRef.current.map((item) => item.key));
    const valid: File[] = [];
    let unsupportedCount = 0;
    let oversizedCount = 0;
    let duplicateCount = 0;

    for (const file of incoming) {
      const format = getInputFormat(file);
      if (format === 'unknown') {
        unsupportedCount += 1;
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        oversizedCount += 1;
        continue;
      }
      const key = fileKey(file);
      if (existing.has(key)) {
        duplicateCount += 1;
        continue;
      }
      existing.add(key);
      valid.push(file);
    }

    const rejectedSummary = [
      unsupportedCount > 0 ? `지원하지 않는 형식 ${unsupportedCount}개` : null,
      oversizedCount > 0 ? `100MB 초과 ${oversizedCount}개` : null,
      duplicateCount > 0 ? `중복 ${duplicateCount}개` : null,
    ].filter(Boolean).join(', ');

    if (rejectedSummary) {
      showNotice(`일부 파일을 제외했습니다: ${rejectedSummary}`, unsupportedCount || oversizedCount ? 'error' : 'info');
    }

    if (valid.length === 0) return 0;
    if (filesRef.current.length + valid.length > MAX_FILES) {
      showNotice(`한 번에 최대 ${MAX_FILES}개 파일만 처리할 수 있습니다.`, 'error');
      return 0;
    }
    const nextItems = await Promise.all(valid.map(async (file) => {
      const objectUrl = URL.createObjectURL(file);
      const size = await getPreviewSize(objectUrl);
      const format = getInputFormat(file);
      return {
        id: uid(),
        key: fileKey(file),
        file,
        inputFormat: format,
        originalUrl: objectUrl,
        originalSize: file.size,
        originalW: size.width,
        originalH: size.height,
        status: 'pending' as const,
        error: null,
        notes: buildNotes(format),
        resultBlob: null,
        resultUrl: null,
        resultSize: null,
        resultW: null,
        resultH: null,
        resultPages: null,
        resultFormat: null,
        resultSignature: null,
        overrides: {},
        customName: '',
      };
    }));
    setFiles((previous) => [...previous, ...nextItems]);
    return nextItems.length;
  }, [showNotice]);

  const importAlbumPhotos = useCallback(async (photos: ImageConverterSeedPhoto[]) => {
    if (isConverting) {
      showNotice('변환이 끝난 뒤 사진첩 이미지를 추가해주세요.', 'info');
      return;
    }

    const importTargets = photos.filter((photo) => !isVideoPhoto(photo));
    if (importTargets.length === 0) {
      showNotice('변환기에 불러올 수 있는 이미지가 없습니다.', 'info');
      return;
    }

    showNotice('사진첩 이미지를 변환 대기열로 불러오는 중입니다…', 'info');
    const results = await Promise.allSettled(importTargets.map(fetchPhotoAsFile));
    const uploadFiles = results
      .filter((result): result is PromiseFulfilledResult<File> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failedCount = results.length - uploadFiles.length;
    const addedCount = uploadFiles.length > 0 ? await addFiles(uploadFiles) : 0;

    if (addedCount > 0 && failedCount > 0) {
      showNotice(`${addedCount}개를 추가했습니다. ${failedCount}개는 외부 이미지 접근 제한으로 건너뛰었습니다.`, 'info');
      return;
    }

    if (addedCount > 0) {
      showNotice(`${addedCount}개 사진을 변환 대기열에 추가했습니다.`, 'success');
      return;
    }

    if (failedCount > 0) {
      showNotice('사진첩 이미지를 불러오지 못했습니다. 외부 이미지 접근 정책을 확인해주세요.', 'error');
    }
  }, [addFiles, isConverting, showNotice]);

  useEffect(() => {
    if (!seedKey || seedKey === lastSeedKeyRef.current || seedPhotos.length === 0) return;
    lastSeedKeyRef.current = seedKey;
    void importAlbumPhotos(seedPhotos);
  }, [importAlbumPhotos, seedKey, seedPhotos]);

  const handlePresetClick = useCallback((presetIdToApply: PresetId) => {
    const preset = PRESETS.find((item) => item.id === presetIdToApply);
    if (!preset) return;
    setPresetId(preset.id);
    setOptions((current) => ({ ...current, ...preset.options }));
  }, []);

  const applySavedPreset = useCallback((preset: SavedPreset) => {
    setPresetId('custom');
    setOptions(mergeOptions(DEFAULT_OPTIONS, preset.options));
    showNotice(`${preset.name} 프리셋을 적용했습니다.`, 'success');
  }, [showNotice]);

  const saveCurrentPreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) {
      showNotice('저장할 프리셋 이름을 입력해주세요.', 'error');
      return;
    }
    const nextPreset: SavedPreset = {
      id: uid(),
      name,
      options: mergeOptions(DEFAULT_OPTIONS, options),
      createdAt: new Date().toISOString(),
    };
    const next = [nextPreset, ...savedPresetsRef.current.filter((preset) => preset.name !== name)].slice(0, 12);
    savedPresetsRef.current = next;
    setSavedPresets(next);
    writeSavedPresets(next);
    setPresetName('');
    showNotice(`${name} 프리셋을 저장했습니다.`, 'success');
  }, [options, presetName, showNotice]);

  const deleteSavedPreset = useCallback((id: string) => {
    const next = savedPresetsRef.current.filter((preset) => preset.id !== id);
    savedPresetsRef.current = next;
    setSavedPresets(next);
    writeSavedPresets(next);
  }, []);

  const pushHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'createdAt'>) => {
    const nextEntry: HistoryEntry = {
      ...entry,
      id: uid(),
      createdAt: new Date().toISOString(),
    };
    const next = [nextEntry, ...historyRef.current].slice(0, 10);
    historyRef.current = next;
    setHistory(next);
    writeHistory(next);
  }, []);

  const updateFileOverrides = useCallback((id: string, overrides: Partial<ConvertOptions>) => {
    setFiles((previous) =>
      previous.map((item) => {
        if (item.id !== id) return item;
        const nextOverrides = { ...item.overrides, ...overrides };
        (Object.keys(nextOverrides) as Array<keyof ConvertOptions>).forEach((key) => {
          if (nextOverrides[key] == null) delete nextOverrides[key];
        });
        return resetConvertedResult({ ...item, overrides: nextOverrides });
      })
    );
  }, []);

  const clearFileOverrides = useCallback((id: string) => {
    setFiles((previous) =>
      previous.map((item) => (item.id === id ? resetConvertedResult({ ...item, overrides: {} }) : item))
    );
  }, []);

  const updateFileName = useCallback((id: string, customName: string) => {
    setFiles((previous) => previous.map((item) => (item.id === id ? { ...item, customName } : item)));
  }, []);

  const runConversion = useCallback(async (targetIds?: string[]) => {
    const queue = filesRef.current.filter((item) => targetIds ? targetIds.includes(item.id) : item.status === 'pending' || item.status === 'error');
    if (queue.length === 0) {
      showNotice('변환할 파일이 없습니다.', 'info');
      return;
    }
    stopRequestedRef.current = false;
    setStopRequested(false);
    setIsConverting(true);
    setBatchTotal(queue.length);
    setBatchProcessed(0);

    let success = 0;
    let failure = 0;
    let processed = 0;
    let interrupted = false;
    let convertedOriginalBytes = 0;
    let convertedResultBytes = 0;
    let lastFormat: OutputFormat = options.format;

    try {
      for (const item of queue) {
        if (stopRequestedRef.current) {
          interrupted = true;
          break;
        }
        setFiles((previous) => previous.map((current) => current.id === item.id ? { ...current, status: 'converting', error: null } : current));
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const itemOptions = mergeOptions(options, item.overrides);
          const itemSignature = buildSignature(itemOptions);
          const result = await convertItem(item, itemOptions, controller.signal, (msg) => {
            setFiles((previous) => previous.map((current) => current.id === item.id ? { ...current, status: 'converting', error: null, notes: [msg] } : current));
          });
          const resultUrl = URL.createObjectURL(result.blob);
          setFiles((previous) => previous.map((current) => {
            if (current.id !== item.id) return current;
            if (current.resultUrl) URL.revokeObjectURL(current.resultUrl);
            return { ...current, status: 'done', error: null, resultBlob: result.blob, resultUrl, resultSize: result.blob.size, resultW: result.width, resultH: result.height, resultPages: result.pages, resultFormat: itemOptions.format, resultSignature: itemSignature };
          }));
          success += 1;
          processed += 1;
          convertedOriginalBytes += item.originalSize;
          convertedResultBytes += result.blob.size;
          lastFormat = itemOptions.format;
          setBatchProcessed(processed);
        } catch (error) {
          if (controller.signal.aborted && stopRequestedRef.current) {
            interrupted = true;
            setFiles((previous) => previous.map((current) => current.id === item.id ? { ...current, status: 'pending', error: null } : current));
            break;
          }
          const message = error instanceof Error ? error.message : '이미지 변환에 실패했습니다.';
          setFiles((previous) => previous.map((current) => current.id === item.id ? { ...current, status: 'error', error: message } : current));
          failure += 1;
          processed += 1;
          setBatchProcessed(processed);
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
        }
      }
    } finally {
      setIsConverting(false);
      setStopRequested(false);
      stopRequestedRef.current = false;
      abortRef.current = null;
      if (interrupted) showNotice('배치 변환을 중단했습니다. 완료된 결과는 유지됩니다.', 'info');
      else if (failure > 0) showNotice(`배치 변환 완료 · 성공 ${success}건 / 실패 ${failure}건`, 'info');
      else showNotice(`배치 변환 완료 · ${success}건 처리`, 'success');
      if (success > 0) {
        pushHistory({
          action: 'convert',
          label: `변환 ${success}건`,
          count: success,
          format: lastFormat,
          originalBytes: convertedOriginalBytes,
          resultBytes: convertedResultBytes,
        });
      }
    }
  }, [options, pushHistory, showNotice]);

  const handleDownload = useCallback((item: ConvertFile) => {
    if (!item.resultBlob || !item.resultUrl || !item.resultFormat) return;
    const link = document.createElement('a');
    link.href = item.resultUrl;
    const index = filesRef.current.findIndex((current) => current.id === item.id);
    link.download = buildOutputFileName(item, Math.max(index, 0), item.resultFormat, naming);
    link.click();
  }, [naming]);

  const handleDownloadAll = useCallback(async () => {
    if (doneItems.length === 0) {
      showNotice('다운로드할 변환 결과가 없습니다.', 'info');
      return;
    }
    const zip = new JSZip();
    const usedNames = new Set<string>();
    doneItems.forEach((item) => {
      if (!item.resultBlob || !item.resultFormat) return;
      const index = filesRef.current.findIndex((current) => current.id === item.id);
      zip.file(buildOutputFileName(item, Math.max(index, 0), item.resultFormat, naming, usedNames), item.resultBlob);
    });
    showNotice('ZIP 패키지를 생성하고 있습니다…', 'info');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `converted-assets-${new Date().toISOString().slice(0, 10)}.zip`;
    link.click();
    URL.revokeObjectURL(zipUrl);
    showNotice(`${doneItems.length}개 결과를 ZIP으로 다운로드했습니다.`, 'success');
  }, [doneItems, naming, showNotice]);

  const handleRemove = useCallback((id: string) => {
    setFiles((previous) => {
      const target = previous.find((item) => item.id === id);
      if (target) revokeItem(target);
      return previous.filter((item) => item.id !== id);
    });
  }, []);

  const handleClear = useCallback(() => {
    filesRef.current.forEach(revokeItem);
    setFiles([]);
  }, []);

  const handleSaveToAlbum = useCallback(async () => {
    if (!destinationAlbumId) {
      showNotice('저장할 앨범을 먼저 선택해주세요.', 'error');
      return;
    }
    if (doneItems.length === 0) {
      showNotice('앨범에 저장할 결과가 없습니다.', 'info');
      return;
    }
    try {
      setIsSaving(true);
      const existingNames = new Set((destinationAlbum?.photoItems ?? []).map((photo) => (photo.fileName || '').toLowerCase()).filter(Boolean));
      const usedNames = new Set(existingNames);
      let skipped = 0;
      let renamed = 0;
      const uploadFiles = doneItems.flatMap((item) => {
        if (!item.resultBlob || !item.resultFormat) throw new Error('업로드할 결과가 없습니다.');
        const index = filesRef.current.findIndex((current) => current.id === item.id);
        const rawName = buildOutputFileName(item, Math.max(index, 0), item.resultFormat, naming);
        if (existingNames.has(rawName.toLowerCase()) && naming.duplicatePolicy === 'skip') {
          skipped += 1;
          return [];
        }
        const finalName = naming.duplicatePolicy === 'rename' ? dedupeFileName(rawName, usedNames) : rawName;
        if (finalName !== rawName) renamed += 1;
        return [new File([item.resultBlob], finalName, { type: getOutputMime(item.resultFormat), lastModified: Date.now() })];
      });
      if (uploadFiles.length === 0) {
        showNotice('저장할 새 결과가 없습니다. 중복 정책을 확인해주세요.', 'info');
        return;
      }
      const uploaded = await photoService.uploadPhotos(destinationAlbumId, uploadFiles, { skipCompression: true });
      await photoService.addPhotoItems(destinationAlbumId, uploaded);
      await Promise.resolve(onAlbumsChanged?.());
      pushHistory({
        action: 'save',
        label: `${uploadFiles.length}개 앨범 저장`,
        count: uploadFiles.length,
        format: doneItems[0]?.resultFormat ?? options.format,
        originalBytes: doneItems.reduce((sum, item) => sum + item.originalSize, 0),
        resultBytes: doneItems.reduce((sum, item) => sum + (item.resultSize ?? 0), 0),
        albumTitle: destinationAlbum?.title,
      });
      showNotice(`${uploadFiles.length}개 결과를 저장했습니다.${renamed > 0 ? ` 중복 ${renamed}개는 새 이름으로 저장했습니다.` : ''}${skipped > 0 ? ` ${skipped}개는 건너뛰었습니다.` : ''}`, 'success');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '앨범 저장에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [destinationAlbum, destinationAlbumId, doneItems, naming, onAlbumsChanged, options.format, pushHistory, showNotice]);

  const requestStop = useCallback(() => {
    if (!isConverting) return;
    stopRequestedRef.current = true;
    setStopRequested(true);
    abortRef.current?.abort();
  }, [isConverting]);

  const primaryPresetIds: PresetId[] = ['balanced', 'photo', 'transparent', 'favicon'];
  const primaryPresets = PRESETS.filter((preset) => primaryPresetIds.includes(preset.id));
  const advancedPresets = PRESETS.filter((preset) => !primaryPresets.some((primary) => primary.id === preset.id));

  const renderPresetButton = (preset: (typeof PRESETS)[number]) => (
    <button
      key={preset.id}
      type="button"
      onClick={() => handlePresetClick(preset.id)}
      aria-pressed={presetId === preset.id}
      style={{
        textAlign: 'left',
        borderRadius: 14,
        border: `1px solid ${presetId === preset.id ? '#818cf8' : '#e2e8f0'}`,
        background: presetId === preset.id ? '#eef2ff' : 'white',
        padding: '12px 13px',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{preset.desc}</div>
      <div style={{ marginTop: 5, fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>{preset.label}</div>
    </button>
  );

  return (
    <Wrap>
      <Hero>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 20, fontWeight: 850, lineHeight: 1.15 }}>이미지 변환 스튜디오</div>
            <div className="studio-copy" style={{ marginTop: 5, color: 'rgba(226,232,240,0.82)', lineHeight: 1.45, fontSize: 13 }}>
              파일 추가, 변환, 다운로드, 앨범 저장을 한 화면에서 처리합니다.
            </div>
          </div>
          <div className="studio-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(92px,1fr))', gap: 8, flex: '1 1 520px' }}>
            {[
              { label: 'Queue', value: `${files.length}개` },
              { label: 'Ready', value: `${doneItems.length}개` },
              { label: 'Estimate', value: totalOriginalBytes > 0 ? `약 ${formatBytes(estimatedBytes)}` : '-' },
              { label: 'Actual', value: totalResultBytes > 0 ? `${formatBytes(totalResultBytes)} (${formatDelta(totalOriginalBytes, totalResultBytes)})` : options.format.toUpperCase() },
            ].map((item) => (
              <div key={item.label} style={{ padding: '9px 11px', borderRadius: 12, background: 'rgba(15,23,42,0.36)', border: '1px solid rgba(148,163,184,0.24)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(191,219,254,0.9)' }}>{item.label}</div>
                <div style={{ marginTop: 5, fontSize: 15, fontWeight: 800 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </Hero>

      {insights.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '14px 24px 0' }}>
          {insights.map((insight) => (
            <div key={insight} style={{ padding: '10px 12px', borderRadius: 14, background: 'white', border: '1px solid #dbeafe', color: '#334155', fontSize: 12.5, lineHeight: 1.55 }}>
              {insight}
            </div>
          ))}
        </div>
      )}
      <Layout>
        <Sidebar>
          <Panel>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366f1' }}>Profiles</div>
            <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>운영 프리셋</div>
            <div style={{ marginTop: 6, color: '#64748b', fontSize: 12.5, lineHeight: 1.55 }}>자주 쓰는 전략을 먼저 고르고, 특수 작업은 고급 프리셋에서 선택합니다.</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {primaryPresets.map(renderPresetButton)}
            </div>
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', color: '#475569', fontSize: 12.5, fontWeight: 800 }}>고급 프리셋 더 보기</summary>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {advancedPresets.map(renderPresetButton)}
              </div>
            </details>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
              <FieldLabel htmlFor="converter-preset-name">현재 설정 저장</FieldLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8 }}>
                <FieldInput
                  id="converter-preset-name"
                  name="converter-preset-name"
                  autoComplete="off"
                  placeholder="예: 쇼핑몰 썸네일…"
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                />
                <Button type="button" onClick={saveCurrentPreset}>저장</Button>
              </div>
              {savedPresets.length > 0 && (
                <MiniList>
                  {savedPresets.map((preset) => (
                    <MiniItem key={preset.id}>
                      <button
                        type="button"
                        onClick={() => applySavedPreset(preset)}
                        style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                      >
                        <div style={{ color: '#0f172a', fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preset.name}</div>
                        <div style={{ marginTop: 3, color: '#64748b', fontSize: 11.5 }}>{preset.options.format.toUpperCase()} · 품질 {preset.options.quality}%</div>
                      </button>
                      <button type="button" aria-label={`${preset.name} 프리셋 삭제`} onClick={() => deleteSavedPreset(preset.id)} style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                      </button>
                    </MiniItem>
                  ))}
                </MiniList>
              )}
            </div>
          </Panel>

          <Panel>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366f1' }}>Album Source</div>
            <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>사진첩에서 편집</div>
            <div style={{ marginTop: 6, color: '#64748b', fontSize: 12.5, lineHeight: 1.55 }}>
              기존 사진첩 이미지를 변환 대기열로 불러와 리사이즈, 포맷 변환, 배경 제거 후 다시 앨범에 저장할 수 있습니다.
            </div>
            <FieldLabel htmlFor="converter-source-album" style={{ marginTop: 12 }}>
              원본 앨범
            </FieldLabel>
            <select
              id="converter-source-album"
              value={sourceAlbumId}
              onChange={(event) => setSourceAlbumId(event.target.value)}
              disabled={albums.length === 0 || isConverting}
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, background: 'white' }}
            >
              {albums.length === 0 ? (
                <option value="">사진첩 앨범이 없습니다.</option>
              ) : (
                albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.title} ({album.photoItems.length})
                  </option>
                ))
              )}
            </select>

            {sourceAlbum ? (
              sourceAlbum.photoItems.length === 0 ? (
                <div style={{ marginTop: 12, padding: '14px 12px', borderRadius: 12, background: '#f8fafc', color: '#64748b', fontSize: 12.5, textAlign: 'center' }}>
                  이 앨범에는 아직 사진이 없습니다.
                </div>
              ) : (
                <>
                  <AlbumSourceGrid style={{ marginTop: 12 }}>
                    {sourceAlbum.photoItems.map((photo) => {
                      const disabled = isConverting || isVideoPhoto(photo);
                      return (
                        <AlbumSourceTile
                          key={photo.id}
                          type="button"
                          disabled={disabled}
                          title={disabled ? '이미지 사진만 변환기에 추가할 수 있습니다.' : '변환 대기열에 추가'}
                          onClick={() => void importAlbumPhotos([{ ...photo, sourceAlbumId: sourceAlbum.id, albumTitle: sourceAlbum.title }])}
                        >
                          {isVideoPhoto(photo) ? (
                            <video src={photo.url} muted />
                          ) : (
                            <img src={photo.url} alt={photo.fileName || photo.prompt || '앨범 사진'} loading="lazy" />
                          )}
                          <span>{photo.fileName || photo.extension?.toUpperCase() || 'album image'}</span>
                        </AlbumSourceTile>
                      );
                    })}
                  </AlbumSourceGrid>
                  <Button
                    type="button"
                    disabled={isConverting || sourceAlbumImages.length === 0}
                    onClick={() => void importAlbumPhotos(sourceAlbumImages)}
                    style={{ width: '100%', marginTop: 10 }}
                  >
                    <i className="fa-solid fa-layer-group" />
                    앨범 이미지 모두 추가
                  </Button>
                </>
              )
            ) : null}
          </Panel>

          <Panel>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366f1' }}>Output</div>
            <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>출력 포맷</div>
            <div role="group" aria-label="출력 포맷" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 12 }}>
              {OUTPUTS.map((output) => (
                <button
                  key={output.format}
                  type="button"
                  onClick={() => updateOptions((current) => ({ ...current, format: output.format }))}
                  aria-pressed={options.format === output.format}
                  style={{
                    borderRadius: 14,
                    border: `1px solid ${options.format === output.format ? '#4f46e5' : '#dbe3ef'}`,
                    background: options.format === output.format ? '#eef2ff' : 'white',
                    padding: '12px 10px',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 800,
                    color: options.format === output.format ? '#4338ca' : '#1f2937',
                  }}
                >
                  {output.label}
                </button>
              ))}
            </div>

            {options.format !== 'ico' && options.format !== 'gif' && (
              <div style={{ marginTop: 14 }}>
                <FieldLabel htmlFor="converter-quality" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>품질</span>
                  <span>{options.quality}%</span>
                </FieldLabel>
                <input id="converter-quality" type="range" min={1} max={100} value={options.quality} onChange={(event) => updateOptions((current) => ({ ...current, quality: Number(event.target.value) }))} style={{ width: '100%' }} />
              </div>
            )}

            {options.format === 'gif' && (
              <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                <div>
                  <FieldLabel htmlFor="converter-gif-colors" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>GIF 팔레트</span>
                    <span>{options.gifColors}</span>
                  </FieldLabel>
                  <input id="converter-gif-colors" type="range" min={32} max={256} step={32} value={options.gifColors} onChange={(event) => updateOptions((current) => ({ ...current, gifColors: Number(event.target.value) }))} style={{ width: '100%' }} />
                </div>
                <div>
                  <FieldLabel htmlFor="converter-gif-dither" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>디더링</span>
                    <span>{options.gifDither.toFixed(1)}</span>
                  </FieldLabel>
                  <input id="converter-gif-dither" type="range" min={0} max={1} step={0.1} value={options.gifDither} onChange={(event) => updateOptions((current) => ({ ...current, gifDither: Number(event.target.value) }))} style={{ width: '100%' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 14 }}>
              <div>
                <FieldLabel htmlFor="converter-max-width">최대 너비</FieldLabel>
                <FieldInput id="converter-max-width" name="converter-max-width" autoComplete="off" type="number" inputMode="numeric" min={0} placeholder="0 = 원본" value={options.maxWidth || ''} onChange={(event) => updateOptions((current) => ({ ...current, maxWidth: clamp(Number(event.target.value) || 0, 0, 12000) }))} />
              </div>
              <div>
                <FieldLabel htmlFor="converter-max-height">최대 높이</FieldLabel>
                <FieldInput id="converter-max-height" name="converter-max-height" autoComplete="off" type="number" inputMode="numeric" min={0} placeholder="0 = 원본" value={options.maxHeight || ''} onChange={(event) => updateOptions((current) => ({ ...current, maxHeight: clamp(Number(event.target.value) || 0, 0, 12000) }))} />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 14, fontSize: 12.5, color: '#334155' }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="checkbox" checked={options.stripMeta} onChange={(event) => updateOptions((current) => ({ ...current, stripMeta: event.target.checked }))} />
                메타데이터 제거
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: options.format === 'jpeg' ? '#94a3b8' : '#334155' }}>
                <input type="checkbox" checked={options.format === 'jpeg' ? true : options.flatten} disabled={options.format === 'jpeg'} onChange={(event) => updateOptions((current) => ({ ...current, flatten: event.target.checked }))} />
                배경색으로 평탄화
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="checkbox" checked={options.squareCrop} onChange={(event) => updateOptions((current) => ({ ...current, squareCrop: event.target.checked }))} />
                정사각형 크롭
              </label>
              {options.squareCrop && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                  <div>
                    <FieldLabel htmlFor="converter-focal-x">초점 X</FieldLabel>
                    <input id="converter-focal-x" type="range" min={0} max={100} value={options.focalX} onChange={(event) => updateOptions((current) => ({ ...current, focalX: Number(event.target.value) }))} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="converter-focal-y">초점 Y</FieldLabel>
                    <input id="converter-focal-y" type="range" min={0} max={100} value={options.focalY} onChange={(event) => updateOptions((current) => ({ ...current, focalY: Number(event.target.value) }))} style={{ width: '100%' }} />
                  </div>
                </div>
              )}
              <div>
                <FieldLabel htmlFor="converter-background">평탄화 배경색</FieldLabel>
                <input id="converter-background" type="color" value={options.background} disabled={!options.flatten && options.format !== 'jpeg'} onChange={(event) => updateOptions((current) => ({ ...current, background: event.target.value }))} style={{ width: '100%', height: 42, border: '1px solid #cbd5e1', borderRadius: 12, background: 'white', opacity: !options.flatten && options.format !== 'jpeg' ? 0.55 : 1 }} />
                <FieldHint>JPEG 출력 또는 배경색 평탄화가 켜졌을 때 적용됩니다.</FieldHint>
              </div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: options.format === 'gif' || options.format === 'webp' ? '#334155' : '#94a3b8' }}>
                <input type="checkbox" checked={options.format === 'gif' || options.format === 'webp' ? options.preserveAnimation : false} disabled={!(options.format === 'gif' || options.format === 'webp')} onChange={(event) => updateOptions((current) => ({ ...current, preserveAnimation: event.target.checked }))} />
                애니메이션 유지
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#6366f1', fontWeight: 800 }}>
                <input type="checkbox" checked={options.removeBackground} onChange={(event) => {
                  const checked = event.target.checked;
                  updateOptions((current) => ({
                    ...current,
                    removeBackground: checked,
                    format: checked && (current.format === 'jpeg' || current.format === 'ico') ? 'webp' : current.format,
                    flatten: checked ? false : current.flatten
                  }));
                  if (checked) showNotice('배경 제거 모드: 투명도 보존을 위해 WebP 출력을 추천합니다.', 'info');
                }} />
                AI 배경 제거 (Alpha)
              </label>
            </div>

            {options.format === 'ico' && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 8 }}>ICO 패키지 크기</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ICO_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => updateOptions((current) => {
                        const exists = current.icoSizes.includes(size);
                        const nextSizes = exists ? current.icoSizes.filter((value) => value !== size) : [...current.icoSizes, size].sort((a, b) => a - b);
                        return { ...current, icoSizes: nextSizes.length > 0 ? nextSizes : [32] };
                      })}
                      style={{
                        borderRadius: 999,
                        border: `1px solid ${options.icoSizes.includes(size) ? '#4f46e5' : '#cbd5e1'}`,
                        background: options.icoSizes.includes(size) ? '#eef2ff' : 'white',
                        color: options.icoSizes.includes(size) ? '#4338ca' : '#475569',
                        padding: '7px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366f1' }}>Destination</div>
            <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>앨범 저장 위치</div>
            <FieldLabel htmlFor="converter-destination-album" style={{ marginTop: 12 }}>저장 앨범</FieldLabel>
            <select
              id="converter-destination-album"
              value={destinationAlbumId}
              onChange={(event) => setDestinationAlbumId(event.target.value)}
              disabled={albums.length === 0 || isSaving}
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, background: 'white' }}
            >
              {albums.length === 0 ? (
                <option value="">먼저 사진첩 앨범을 생성하세요.</option>
              ) : (
                albums.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.title}
                  </option>
                ))
              )}
            </select>
            <FieldHint>완료된 결과는 이 앨범으로 저장됩니다. 원본 파일은 다시 압축하지 않습니다.</FieldHint>

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
              <FieldLabel htmlFor="converter-naming-mode">파일명 규칙</FieldLabel>
              <FieldSelect
                id="converter-naming-mode"
                value={naming.mode}
                onChange={(event) => setNaming((current) => ({ ...current, mode: event.target.value as NamingMode }))}
              >
                <option value="original">원본 이름 유지</option>
                <option value="prefixSuffix">접두사/접미사</option>
                <option value="pattern">패턴 사용</option>
              </FieldSelect>
              {naming.mode === 'prefixSuffix' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 10 }}>
                  <div>
                    <FieldLabel htmlFor="converter-name-prefix">접두사</FieldLabel>
                    <FieldInput id="converter-name-prefix" name="converter-name-prefix" autoComplete="off" placeholder="예: shop-…" value={naming.prefix} onChange={(event) => setNaming((current) => ({ ...current, prefix: event.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="converter-name-suffix">접미사</FieldLabel>
                    <FieldInput id="converter-name-suffix" name="converter-name-suffix" autoComplete="off" placeholder="예: -web…" value={naming.suffix} onChange={(event) => setNaming((current) => ({ ...current, suffix: event.target.value }))} />
                  </div>
                </div>
              )}
              {naming.mode === 'pattern' && (
                <div style={{ marginTop: 10 }}>
                  <FieldLabel htmlFor="converter-name-pattern">패턴</FieldLabel>
                  <FieldInput id="converter-name-pattern" name="converter-name-pattern" autoComplete="off" placeholder="{name}-{index}…" value={naming.pattern} onChange={(event) => setNaming((current) => ({ ...current, pattern: event.target.value }))} />
                  <FieldHint>{'{name}'}, {'{index}'}, {'{format}'} 토큰을 사용할 수 있습니다.</FieldHint>
                </div>
              )}
              <FieldLabel htmlFor="converter-duplicate-policy" style={{ marginTop: 12 }}>중복 파일명 처리</FieldLabel>
              <FieldSelect
                id="converter-duplicate-policy"
                value={naming.duplicatePolicy}
                onChange={(event) => setNaming((current) => ({ ...current, duplicatePolicy: event.target.value as DuplicatePolicy }))}
              >
                <option value="rename">새 이름으로 저장</option>
                <option value="skip">건너뛰기</option>
              </FieldSelect>
            </div>

            {history.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#334155' }}>최근 작업</div>
                <MiniList>
                  {history.slice(0, 5).map((entry) => (
                    <MiniItem key={entry.id}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#0f172a', fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.label}
                        </div>
                        <div style={{ marginTop: 3, color: '#64748b', fontSize: 11.5 }}>
                          {entry.format.toUpperCase()} · {formatBytes(entry.originalBytes)} → {formatBytes(entry.resultBytes)} {entry.albumTitle ? `· ${entry.albumTitle}` : ''}
                        </div>
                      </div>
                      <i className={`fa-solid ${entry.action === 'save' ? 'fa-folder-plus' : 'fa-rotate'}`} aria-hidden="true" style={{ color: '#6366f1' }} />
                    </MiniItem>
                  ))}
                </MiniList>
              </div>
            )}
          </Panel>
        </Sidebar>

        <Content>
          <Toolbar>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>변환 작업 대기열</div>
              <div style={{ fontSize: 12.5, color: '#64748b' }}>
                전체 {files.length}개 · 대기 {pendingItems.length} · 완료 {doneItems.length} · 오류 {errorItems.length}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <Button $primary type="button" disabled={isConverting || files.every((item) => item.status === 'done')} onClick={() => void runConversion()}>
              <i className="fa-solid fa-rotate" />
              전체 변환
            </Button>
            <Button type="button" disabled={!isConverting} onClick={requestStop}>
              <i className="fa-solid fa-hand" />
              {stopRequested ? '중단 요청됨' : '작업 중단'}
            </Button>
            <Button type="button" disabled={isConverting || errorItems.length === 0} onClick={() => void runConversion(errorItems.map((item) => item.id))}>
              <i className="fa-solid fa-triangle-exclamation" />
              오류만 재시도
            </Button>
            <Button type="button" disabled={doneItems.length === 0} onClick={() => void handleDownloadAll()}>
              <i className="fa-solid fa-file-zipper" />
              ZIP 다운로드
            </Button>
            <Button $danger type="button" disabled={isConverting || files.length === 0} onClick={handleClear}>
              <i className="fa-solid fa-trash" />
              초기화
            </Button>
          </Toolbar>

          {isConverting && (
            <div style={{ height: 4, margin: '0 18px', background: 'rgba(99,102,241,0.12)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#22c55e)', transition: 'width 0.2s ease' }} />
            </div>
          )}

          <DropZone
            $active={isDragOver}
            $disabled={isConverting}
            onDragOver={(event) => {
              event.preventDefault();
              if (!isConverting) setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragOver(false);
              if (!isConverting) void addFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <div className="dropzone-inner" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#e0e7ff,#eff6ff)', color: '#4f46e5', fontSize: 22 }}>
                    <i className={`fa-solid ${isDragOver ? 'fa-circle-down' : 'fa-cloud-arrow-up'}`} />
                  </div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>파일을 끌어 놓거나 버튼으로 배치 추가</div>
                    <div style={{ marginTop: 6, color: '#475569', fontSize: 14, lineHeight: 1.65 }}>
                      `AVIF`, `GIF`, `ICO`, `JPEG`, `PNG`, `WebP`, `SVG` 입력을 받아 선택한 결과 포맷으로 변환합니다.
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                  {['AVIF', 'GIF', 'ICO', 'JPEG', 'PNG', 'WebP', 'SVG'].map((item) => (
                    <div key={item} style={{ padding: '7px 10px', borderRadius: 999, background: '#f8fafc', border: '1px solid #dbeafe', color: '#334155', fontSize: 12, fontWeight: 700 }}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="dropzone-actions" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
                <Button
                  $primary
                  type="button"
                  disabled={isConverting}
                  onClick={(event) => {
                    event.stopPropagation();
                    inputRef.current?.click();
                  }}
                >
                  <i className="fa-solid fa-folder-open" />
                  파일 선택
                </Button>
                <div style={{ textAlign: 'right', color: '#64748b', fontSize: 12.5, lineHeight: 1.55 }}>
                  최대 {MAX_FILES}개 파일
                  <br />
                  파일당 최대 100MB
                </div>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              style={{ display: 'none' }}
              onChange={(event) => {
                if (event.target.files) void addFiles(Array.from(event.target.files));
                event.target.value = '';
              }}
            />
          </DropZone>
          {files.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center', color: '#64748b' }}>
              <div style={{ maxWidth: 460 }}>
                <div style={{ width: 72, height: 72, margin: '0 auto 16px', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#dbeafe,#eef2ff)', color: '#4f46e5', fontSize: 26 }}>
                  <i className="fa-solid fa-photo-film" />
                </div>
                <div style={{ color: '#0f172a', fontWeight: 800, fontSize: 17 }}>아직 변환 대기열이 비어 있습니다.</div>
                <div style={{ marginTop: 8, lineHeight: 1.65, fontSize: 14 }}>
                  위 드롭존에 자산을 넣으면 서버 변환과 ICO 패키징을 같은 흐름으로 처리하고, 완료된 결과를 ZIP 또는 사진첩 앨범에 바로 저장할 수 있습니다.
                </div>
              </div>
            </div>
          ) : (
            <>
              <Queue>
                {files.map((item) => {
                  const itemOptions = mergeOptions(options, item.overrides);
                  const delta = formatDelta(item.originalSize, item.resultSize);
                  const outputFormat = item.resultFormat ?? itemOptions.format;
                  const outputName = buildOutputFileName(item, files.findIndex((current) => current.id === item.id), outputFormat, naming);
                  const hasOverrides = Object.keys(item.overrides).length > 0 || item.customName.trim().length > 0;
                  return (
                    <Row key={item.id} $status={item.status}>
                      <CompareGrid>
                        <CompareTile>
                          <img src={item.originalUrl} alt={`${item.file.name} 원본`} loading="lazy" />
                          <CompareLabel>원본</CompareLabel>
                        </CompareTile>
                        <CompareTile>
                          <img src={item.resultUrl ?? item.originalUrl} alt={`${item.file.name} 변환 결과`} loading="lazy" />
                          <CompareLabel>{item.resultUrl ? '결과' : '대기'}</CompareLabel>
                        </CompareTile>
                      </CompareGrid>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</div>
                        <div style={{ marginTop: 4, color: '#64748b', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          저장 파일명: {outputName}
                        </div>
                        <TokenList>
                          {[
                            item.inputFormat.toUpperCase(),
                            formatBytes(item.originalSize),
                            item.originalW > 0 ? `${item.originalW}×${item.originalH}px` : null,
                            `→ ${outputFormat.toUpperCase()}`,
                            item.resultSize != null ? formatBytes(item.resultSize) : null,
                            item.resultW != null && item.resultH != null ? `${item.resultW}×${item.resultH}px` : null,
                            item.resultPages != null && item.resultPages > 1 ? `${item.resultPages} frames` : null,
                            delta != null ? `용량 ${delta}` : `예상 ${formatBytes(estimateOutputBytes(item.originalSize, itemOptions))}`,
                            itemOptions.squareCrop ? '정사각형 크롭' : null,
                            hasOverrides ? '개별 설정' : null,
                          ].filter(Boolean).map((token, index) => (
                            <Token key={`${token}-${index}`} $accent={String(token).startsWith('용량 -')} $danger={String(token).startsWith('용량 +')}>
                              {token}
                            </Token>
                          ))}
                        </TokenList>
                        {item.notes.length > 0 && (
                          <TokenList style={{ marginTop: 8 }}>
                            {item.notes.map((note) => (
                              <Token key={note}>
                                {note}
                              </Token>
                            ))}
                          </TokenList>
                        )}
                        {item.error && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12.5, fontWeight: 600 }}>{item.error}</div>}
                        <Inspector>
                          <summary>개별 설정</summary>
                          <InspectorBody>
                            <div>
                              <FieldLabel htmlFor={`file-name-${item.id}`}>저장 이름</FieldLabel>
                              <FieldInput id={`file-name-${item.id}`} name={`file-name-${item.id}`} autoComplete="off" placeholder={fileStem(item.file.name)} value={item.customName} onChange={(event) => updateFileName(item.id, event.target.value)} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={`file-format-${item.id}`}>포맷</FieldLabel>
                              <FieldSelect id={`file-format-${item.id}`} value={item.overrides.format ?? ''} onChange={(event) => updateFileOverrides(item.id, { format: event.target.value ? event.target.value as OutputFormat : undefined })}>
                                <option value="">전체 설정</option>
                                {OUTPUTS.map((output) => <option key={output.format} value={output.format}>{output.label}</option>)}
                              </FieldSelect>
                            </div>
                            <div>
                              <FieldLabel htmlFor={`file-quality-${item.id}`}>품질</FieldLabel>
                              <FieldInput id={`file-quality-${item.id}`} name={`file-quality-${item.id}`} autoComplete="off" type="number" inputMode="numeric" min={1} max={100} value={item.overrides.quality ?? ''} placeholder={`${options.quality}`} onChange={(event) => updateFileOverrides(item.id, { quality: event.target.value ? clamp(Number(event.target.value), 1, 100) : undefined })} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={`file-width-${item.id}`}>최대 너비</FieldLabel>
                              <FieldInput id={`file-width-${item.id}`} name={`file-width-${item.id}`} autoComplete="off" type="number" inputMode="numeric" min={0} value={item.overrides.maxWidth ?? ''} placeholder={options.maxWidth ? String(options.maxWidth) : '원본'} onChange={(event) => updateFileOverrides(item.id, { maxWidth: event.target.value ? clamp(Number(event.target.value), 0, 12000) : undefined })} />
                            </div>
                            <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 12.5, color: '#334155' }}>
                              <input type="checkbox" checked={item.overrides.squareCrop ?? false} onChange={(event) => updateFileOverrides(item.id, { squareCrop: event.target.checked })} />
                              이 파일만 정사각형
                            </label>
                            <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 12.5, color: '#334155' }}>
                              <input type="checkbox" checked={item.overrides.flatten ?? false} onChange={(event) => updateFileOverrides(item.id, { flatten: event.target.checked })} />
                              이 파일만 평탄화
                            </label>
                            <Button type="button" disabled={!hasOverrides} onClick={() => clearFileOverrides(item.id)}>
                              초기화
                            </Button>
                          </InspectorBody>
                        </Inspector>
                      </div>
                      <RowActions>
                        <div style={{ padding: '6px 10px', borderRadius: 999, background: item.status === 'done' ? '#dcfce7' : item.status === 'error' ? '#fee2e2' : item.status === 'converting' ? '#e0e7ff' : '#f1f5f9', color: item.status === 'done' ? '#166534' : item.status === 'error' ? '#b91c1c' : item.status === 'converting' ? '#4338ca' : '#475569', fontSize: 12, fontWeight: 800 }}>
                          {item.status === 'pending' && '대기'}
                          {item.status === 'converting' && '변환 중'}
                          {item.status === 'done' && '완료'}
                          {item.status === 'error' && '오류'}
                        </div>
                        {item.status === 'done' && (
                          <Button type="button" onClick={() => handleDownload(item)}>
                            <i className="fa-solid fa-download" />
                            다운로드
                          </Button>
                        )}
                        {(item.status === 'pending' || item.status === 'error') && (
                          <Button type="button" disabled={isConverting} onClick={() => void runConversion([item.id])}>
                            <i className="fa-solid fa-play" />
                            개별 변환
                          </Button>
                        )}
                        <Button $danger type="button" disabled={isConverting && item.status === 'converting'} onClick={() => handleRemove(item.id)}>
                          <i className="fa-solid fa-xmark" />
                          제거
                        </Button>
                      </RowActions>
                    </Row>
                  );
                })}
              </Queue>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'end', padding: '16px 18px', borderTop: '1px solid #e2e8f0', background: 'rgba(248,250,252,0.96)' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#334155' }}>
                    저장 대상: {destinationAlbum?.title ?? '앨범 없음'}
                  </div>
                  <div style={{ marginTop: 6, color: '#64748b', fontSize: 12, lineHeight: 1.55 }}>
                    저장 위치와 파일명 규칙은 아래 Destination 패널에서 바꿀 수 있습니다.
                  </div>
                </div>
                <Button $primary type="button" disabled={isSaving || doneItems.length === 0 || albums.length === 0} onClick={() => void handleSaveToAlbum()}>
                  <i className="fa-solid fa-folder-plus" />
                  {isSaving ? '저장 중…' : `${doneItems.length}개 앨범 저장`}
                </Button>
              </div>
            </>
          )}
        </Content>
      </Layout>

      {notice && (
        <NoticeBar
          $tone={notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
        >
          {notice.message}
        </NoticeBar>
      )}
    </Wrap>
  );
}
