'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import styled from 'styled-components';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileAudio2,
  FileCode2,
  FileImage,
  FileText,
  FileVideo2,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Home,
  Loader2,
  LogIn,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { storage } from '@/firebase/config';
import type {
  AdminStorageCreateFolderResponse,
  AdminStorageErrorResponse,
  AdminStorageFile,
  AdminStorageListResponse,
  AdminStorageUrlResponse,
} from '@/types/storageBrowser';

type CurrentUser = NonNullable<ReturnType<typeof useAuth>['currentUser']>;
type StorageNodeType = 'folder' | 'file';

type StorageNode = {
  id: string;
  type: StorageNodeType;
  name: string;
  path: string;
  parentPath: string | null;
  depth: number;
  children: StorageNode[];
  file: AdminStorageFile | null;
  sizeBytes: number;
  totalBytes: number;
  fileCount: number;
  folderCount: number;
  updatedAt: string | null;
};

const STORAGE_LIST_LIMIT = 12000;
const STORAGE_FOLDER_NAME_LIMIT = 120;
const ROOT_NODE_ID = 'folder:__root__';
const PREVIEW_LIMIT = 240;
const IMAGE_FILE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'ico', 'jfif', 'jpg', 'jpeg', 'png', 'svg', 'tif', 'tiff', 'webp']);
const VIDEO_FILE_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'webm']);

const PageShell = styled.main`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f5f7fb;
  color: #172033;

  @media (max-width: 760px) {
    min-height: 100dvh;
    overflow: auto;
  }
`;

const HeaderBand = styled.section`
  flex-shrink: 0;
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(23, 32, 51, 0.08);
  background: #ffffff;

  @media (max-width: 760px) {
    padding: 14px 12px;
  }
`;

const HeaderGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(280px, 460px) auto;
  gap: 12px;
  align-items: center;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`;

const TitleBlock = styled.div`
  min-width: 0;

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 5px;
    color: #0f766e;
    font-size: 0.72rem;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: #111827;
    font-size: 1.28rem;
    line-height: 1.2;
    font-weight: 900;
    letter-spacing: 0;
  }

  p {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 0.82rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
`;

const SearchBox = styled.label`
  height: 42px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #f8fafc;
  color: #64748b;

  &:focus-within {
    background: #ffffff;
    border-color: rgba(15, 118, 110, 0.48);
    box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.09);
  }

  input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #111827;
    font-size: 0.9rem;
  }

  button {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #94a3b8;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  button:hover {
    background: #e2e8f0;
    color: #334155;
  }
`;

const ActionGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;

  @media (max-width: 1120px) {
    justify-content: flex-start;
  }
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'quiet' }>`
  height: 38px;
  min-width: 0;
  border-radius: 10px;
  border: 1px solid ${({ $variant }) => ($variant === 'primary' ? 'rgba(15, 118, 110, 0.28)' : 'rgba(15, 23, 42, 0.12)')};
  background: ${({ $variant }) => ($variant === 'primary' ? '#0f766e' : $variant === 'quiet' ? '#f8fafc' : '#ffffff')};
  color: ${({ $variant }) => ($variant === 'primary' ? '#ffffff' : '#334155')};
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 850;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(15, 23, 42, 0.22);
    box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  }

  &:disabled {
    opacity: 0.48;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  &:focus-visible {
    outline: 3px solid rgba(15, 118, 110, 0.28);
    outline-offset: 2px;
  }
`;

const SummaryStrip = styled.div`
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const SummaryItem = styled.div`
  min-width: 0;
  min-height: 64px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: #f8fafc;
  padding: 11px 12px;

  .value {
    color: #111827;
    font-size: 1rem;
    font-weight: 900;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }

  .label {
    margin-top: 6px;
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 800;
  }
`;

const ContentGrid = styled.section`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  padding: 14px 18px 18px;

  @media (max-width: 1160px) {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  @media (max-width: 760px) {
    padding: 10px 12px 24px;
    gap: 10px;
  }
`;

const DrivePanel = styled.section`
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  background: #ffffff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.07);

  @media (max-width: 760px) {
    min-height: 520px;
  }
`;

const DriveToolbar = styled.div`
  min-height: 58px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;

  .folder-title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #111827;
    font-size: 0.9rem;
    font-weight: 900;
  }

  .meta,
  .toolbar-meta {
    color: #64748b;
    font-size: 0.76rem;
    font-weight: 800;
  }

  @media (max-width: 760px) {
    align-items: stretch;

    .folder-title,
    .meta,
    .toolbar-meta {
      width: 100%;
    }
  }
`;

const ToolbarActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;

  @media (max-width: 760px) {
    width: 100%;
    justify-content: space-between;
  }
`;

const Breadcrumbs = styled.nav`
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 2px;

  &::-webkit-scrollbar {
    height: 0;
  }
`;

const CrumbButton = styled.button<{ $active?: boolean }>`
  height: 30px;
  max-width: 220px;
  border: 0;
  border-radius: 8px;
  background: ${({ $active }) => ($active ? '#e8f0fe' : 'transparent')};
  color: ${({ $active }) => ($active ? '#174ea6' : '#334155')};
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 850;
  white-space: nowrap;
  cursor: pointer;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    background: #f1f5f9;
  }

  &:focus-visible {
    outline: 3px solid rgba(37, 99, 235, 0.2);
    outline-offset: 2px;
  }
`;

const LimitNotice = styled.div`
  padding: 9px 14px;
  border-bottom: 1px solid rgba(180, 83, 9, 0.14);
  background: #fffbeb;
  color: #92400e;
  font-size: 0.78rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DriveViewport = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px;

  @media (max-width: 760px) {
    padding: 12px;
  }
`;

const SectionBlock = styled.section`
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;

  h2 {
    margin: 0;
    color: #111827;
    font-size: 0.86rem;
    font-weight: 900;
  }

  span {
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 800;
  }
`;

const FolderGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 10px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const FileGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  gap: 12px;

  @media (max-width: 560px) {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
`;

const FolderTile = styled.article<{ $selected?: boolean }>`
  min-width: 0;
  height: 58px;
  border: 1px solid ${({ $selected }) => ($selected ? 'rgba(26, 115, 232, 0.42)' : 'rgba(15, 23, 42, 0.08)')};
  border-radius: 8px;
  background: ${({ $selected }) => ($selected ? '#e8f0fe' : '#ffffff')};
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    box-shadow 0.14s ease;

  &:hover {
    border-color: rgba(26, 115, 232, 0.28);
    background: #f8fbff;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
  }

  .folder-icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: #e8f0fe;
    color: #1a73e8;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .folder-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .name {
    color: #111827;
    font-size: 0.84rem;
    font-weight: 850;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 750;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const FileTile = styled.article<{ $selected?: boolean }>`
  min-width: 0;
  min-height: 188px;
  border: 1px solid ${({ $selected }) => ($selected ? 'rgba(15, 118, 110, 0.42)' : 'rgba(15, 23, 42, 0.08)')};
  border-radius: 8px;
  background: ${({ $selected }) => ($selected ? '#ecfdf5' : '#ffffff')};
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    box-shadow 0.14s ease,
    transform 0.14s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(15, 23, 42, 0.18);
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  }

  .preview {
    height: 122px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.07);
  }

  .file-copy {
    min-width: 0;
    padding: 10px;
    display: grid;
    gap: 5px;
  }

  .name {
    color: #111827;
    font-size: 0.82rem;
    font-weight: 850;
    line-height: 1.25;
    min-height: 32px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
  }

  .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 800;
  }
`;

const PreviewFrame = styled.div<{ $tone?: 'folder' | 'image' | 'video' | 'file' }>`
  width: 100%;
  height: 100%;
  border-radius: ${({ $tone }) => ($tone === 'file' ? '0' : 'inherit')};
  background: ${({ $tone }) =>
    $tone === 'image'
      ? '#eef6ff'
      : $tone === 'video'
        ? '#eef2f7'
        : $tone === 'folder'
          ? '#e8f0fe'
          : '#f1f5f9'};
  color: ${({ $tone }) => ($tone === 'folder' ? '#1a73e8' : '#475569')};
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;

  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .fallback {
    width: 46px;
    height: 46px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.72);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  }

  .video-badge {
    position: absolute;
    right: 8px;
    bottom: 8px;
    height: 24px;
    border-radius: 999px;
    padding: 0 8px;
    background: rgba(15, 23, 42, 0.78);
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.68rem;
    font-weight: 850;
  }
`;

const DetailPanel = styled.aside`
  min-height: 0;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  background: #ffffff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.06);

  @media (max-width: 1160px) {
    min-height: 360px;
  }
`;

const DetailHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  display: grid;
  gap: 10px;

  .detail-preview {
    width: 100%;
    height: 172px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(15, 23, 42, 0.07);
  }

  h2 {
    margin: 0;
    color: #111827;
    font-size: 1rem;
    line-height: 1.25;
    font-weight: 900;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0;
    color: #64748b;
    font-size: 0.78rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
`;

const DetailBody = styled.div`
  min-height: 0;
  overflow: auto;
  padding: 16px;
  display: grid;
  align-content: start;
  gap: 16px;
`;

const DetailActions = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 8px;

  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;

const DetailList = styled.dl`
  margin: 0;
  display: grid;
  gap: 11px;

  div {
    min-width: 0;
  }

  dt {
    margin: 0 0 4px;
    color: #94a3b8;
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    color: #334155;
    font-size: 0.8rem;
    font-weight: 760;
    overflow-wrap: anywhere;
  }
`;

const EmptyState = styled.div`
  min-height: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px;
  color: #64748b;
  text-align: center;

  .icon {
    width: 56px;
    height: 56px;
    border-radius: 15px;
    background: #ecfdf5;
    color: #0f766e;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  h2 {
    margin: 0;
    color: #111827;
    font-size: 1rem;
    font-weight: 900;
  }

  p {
    margin: 0;
    max-width: 420px;
    font-size: 0.82rem;
    line-height: 1.5;
  }
`;

const DialogBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 60;
  padding: 20px;
  background: rgba(15, 23, 42, 0.38);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const FolderDialog = styled.form`
  width: min(420px, 100%);
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
  overflow: hidden;
`;

const FolderDialogHeader = styled.div`
  padding: 16px 18px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h2 {
    margin: 0;
    color: #111827;
    font-size: 0.98rem;
    font-weight: 900;
  }

  p {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 0.78rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
`;

const IconButton = styled.button`
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  background: #f1f5f9;
  color: #475569;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #e2e8f0;
    color: #111827;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FolderDialogBody = styled.div`
  padding: 18px;
  display: grid;
  gap: 9px;

  label {
    color: #334155;
    font-size: 0.78rem;
    font-weight: 850;
  }

  input {
    width: 100%;
    min-width: 0;
    height: 42px;
    border: 1px solid rgba(15, 23, 42, 0.14);
    border-radius: 10px;
    background: #ffffff;
    color: #111827;
    padding: 0 12px;
    font: inherit;
    font-size: 0.9rem;
    box-sizing: border-box;
  }

  input:focus {
    outline: 0;
    border-color: rgba(15, 118, 110, 0.5);
    box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.09);
  }

  input:disabled {
    background: #f8fafc;
    color: #94a3b8;
  }
`;

const FieldError = styled.p`
  margin: 0;
  color: #b91c1c;
  font-size: 0.76rem;
  font-weight: 800;
`;

const FolderDialogFooter = styled.div`
  padding: 14px 18px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: #f8fafc;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

const AccessState = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;

  .box {
    width: min(420px, 100%);
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 12px;
    background: #ffffff;
    padding: 24px;
    display: grid;
    gap: 14px;
    text-align: center;
    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
  }

  .icon {
    width: 52px;
    height: 52px;
    margin: 0 auto;
    border-radius: 12px;
    background: #eff6ff;
    color: #2563eb;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  h1 {
    margin: 0;
    color: #111827;
    font-size: 1.1rem;
    font-weight: 900;
  }

  p {
    margin: 0;
    color: #64748b;
    font-size: 0.84rem;
    line-height: 1.5;
  }
`;

const Spinner = styled(Loader2)`
  animation: spin 0.9s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

function formatBytes(bytes: number | null | undefined): string {
  if (!Number.isFinite(bytes ?? 0) || !bytes || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  if (lastDot < 0 || lastDot === name.length - 1) return '';
  return name.slice(lastDot + 1).toLocaleLowerCase('en-US');
}

function isImageStorageFile(file: AdminStorageFile | null): boolean {
  if (!file) return false;
  return (file.contentType ?? '').startsWith('image/') || IMAGE_FILE_EXTENSIONS.has(getExtension(file.name));
}

function isVideoStorageFile(file: AdminStorageFile | null): boolean {
  if (!file) return false;
  return (file.contentType ?? '').startsWith('video/') || VIDEO_FILE_EXTENSIONS.has(getExtension(file.name));
}

function getFileKind(file: AdminStorageFile | null): string {
  if (!file) return '폴더';
  const contentType = file.contentType ?? '';
  const extension = getExtension(file.name);

  if (isImageStorageFile(file)) {
    return '이미지';
  }
  if (isVideoStorageFile(file)) return '동영상';
  if (contentType.startsWith('audio/')) return '오디오';
  if (contentType.includes('pdf')) return 'PDF';
  if (contentType.includes('json') || ['ts', 'tsx', 'js', 'jsx', 'css', 'html', 'md'].includes(extension)) return '코드';
  if (contentType.includes('zip') || ['zip', '7z', 'rar', 'tar', 'gz'].includes(extension)) return '압축';
  if (contentType.startsWith('text/') || ['txt', 'csv'].includes(extension)) return '문서';

  return '파일';
}

function isPreviewableMedia(file: AdminStorageFile | null): boolean {
  return isImageStorageFile(file) || isVideoStorageFile(file);
}

function FileTypeIcon({ file, size = 18 }: { file: AdminStorageFile | null; size?: number }) {
  const kind = getFileKind(file);
  if (isImageStorageFile(file)) return <FileImage size={size} />;
  if (isVideoStorageFile(file)) return <FileVideo2 size={size} />;
  if (kind === '오디오') return <FileAudio2 size={size} />;
  if (kind === 'PDF' || kind === '문서') return <FileText size={size} />;
  if (kind === '코드') return <FileCode2 size={size} />;
  if (kind === '압축') return <FileArchive size={size} />;
  return <File size={size} />;
}

function createFolderNode(name: string, path: string, depth: number, parentPath: string | null): StorageNode {
  return {
    id: path ? `folder:${path}` : ROOT_NODE_ID,
    type: 'folder',
    name,
    path,
    parentPath,
    depth,
    children: [],
    file: null,
    sizeBytes: 0,
    totalBytes: 0,
    fileCount: 0,
    folderCount: 0,
    updatedAt: null,
  };
}

function buildStorageTree(files: AdminStorageFile[]): StorageNode {
  const root = createFolderNode('Storage root', '', 0, null);
  const folders = new Map<string, StorageNode>([['', root]]);

  files.forEach((file) => {
    const path = file.path.trim().replace(/^\/+/, '');
    if (!path) return;

    const isFolderMarker = path.endsWith('/');
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return;

    let parent = root;
    let parentPath = '';
    const folderSegmentCount = isFolderMarker ? parts.length : parts.length - 1;

    for (let index = 0; index < folderSegmentCount; index += 1) {
      const segment = parts[index];
      const folderPath = parentPath ? `${parentPath}/${segment}` : segment;
      let folder = folders.get(folderPath);

      if (!folder) {
        folder = createFolderNode(segment, folderPath, index + 1, parentPath || null);
        folders.set(folderPath, folder);
        parent.children.push(folder);
      }

      parent = folder;
      parentPath = folderPath;
    }

    if (isFolderMarker) return;

    const fileName = parts[parts.length - 1] ?? file.name;
    parent.children.push({
      id: `file:${path}`,
      type: 'file',
      name: fileName,
      path,
      parentPath: parentPath || null,
      depth: parts.length,
      children: [],
      file,
      sizeBytes: file.sizeBytes,
      totalBytes: file.sizeBytes,
      fileCount: 1,
      folderCount: 0,
      updatedAt: file.updatedAt,
    });
  });

  const finalize = (node: StorageNode): void => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'ko-KR', { numeric: true, sensitivity: 'base' });
    });

    let totalBytes = node.type === 'file' ? node.sizeBytes : 0;
    let fileCount = node.type === 'file' ? 1 : 0;
    let folderCount = 0;
    let latest = node.updatedAt;

    node.children.forEach((child) => {
      finalize(child);
      totalBytes += child.totalBytes;
      fileCount += child.fileCount;
      folderCount += child.type === 'folder' ? child.folderCount + 1 : child.folderCount;

      if (child.updatedAt && (!latest || new Date(child.updatedAt).getTime() > new Date(latest).getTime())) {
        latest = child.updatedAt;
      }
    });

    node.totalBytes = totalBytes;
    node.fileCount = fileCount;
    node.folderCount = folderCount;
    node.updatedAt = latest;
  };

  finalize(root);
  return root;
}

function findNode(node: StorageNode, id: string): StorageNode | null {
  if (node.id === id) return node;

  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }

  return null;
}

function findFolderByPath(root: StorageNode, path: string): StorageNode | null {
  return path ? findNode(root, `folder:${path}`) : root;
}

function getBreadcrumbs(root: StorageNode, currentFolder: StorageNode): StorageNode[] {
  if (currentFolder.id === ROOT_NODE_ID) return [root];

  const crumbs: StorageNode[] = [root];
  let cursor = '';

  currentFolder.path
    .split('/')
    .filter(Boolean)
    .forEach((segment) => {
      cursor = cursor ? `${cursor}/${segment}` : segment;
      const folder = findFolderByPath(root, cursor);
      if (folder) crumbs.push(folder);
    });

  return crumbs;
}

function matchesNode(node: StorageNode, keyword: string): boolean {
  if (!keyword) return true;

  const haystack = [node.name, node.path, node.file?.contentType ?? '', node.file?.bucket ?? '']
    .join(' ')
    .toLocaleLowerCase('ko-KR');

  return haystack.includes(keyword);
}

function collectMatchingNodes(root: StorageNode, keyword: string): StorageNode[] {
  const result: StorageNode[] = [];

  const visit = (node: StorageNode): void => {
    node.children.forEach((child) => {
      if (matchesNode(child, keyword)) result.push(child);
      if (child.type === 'folder') visit(child);
    });
  };

  visit(root);
  return result;
}

async function fetchStorageInventory(currentUser: CurrentUser): Promise<AdminStorageListResponse> {
  const token = await currentUser.getIdToken();
  const response = await fetch(`/api/admin/storage?limit=${STORAGE_LIST_LIMIT}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as AdminStorageListResponse | AdminStorageErrorResponse;

  if (!response.ok || payload.ok !== true) {
    throw new Error('error' in payload ? payload.error : 'Storage 목록을 불러오지 못했습니다.');
  }

  return payload;
}

async function fetchSignedFileUrl(
  currentUser: CurrentUser,
  path: string,
  options?: { download?: boolean },
): Promise<AdminStorageUrlResponse> {
  const token = await currentUser.getIdToken();
  const params = new URLSearchParams({ downloadPath: path });
  if (options?.download) params.set('download', '1');

  const response = await fetch(`/api/admin/storage?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as AdminStorageUrlResponse | AdminStorageErrorResponse;

  if (!response.ok || payload.ok !== true) {
    throw new Error('error' in payload ? payload.error : '파일 URL을 만들지 못했습니다.');
  }

  return payload;
}

function normalizeUploadFileName(fileName: string): string | null {
  const trimmed = fileName.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/') || trimmed.includes('\\')) return null;
  if (trimmed === '.' || trimmed === '..') return null;
  if (/[\u0000-\u001f]/.test(trimmed)) return null;
  return trimmed;
}

function buildStorageFilePath(parentPath: string, fileName: string): string {
  return parentPath ? `${parentPath}/${fileName}` : fileName;
}

function validateFolderName(value: string): string | null {
  const folderName = value.trim();
  if (!folderName) return '폴더 이름을 입력해 주세요.';
  if (folderName.length > STORAGE_FOLDER_NAME_LIMIT) return `폴더 이름은 ${STORAGE_FOLDER_NAME_LIMIT}자 이하로 입력해 주세요.`;
  if (folderName.includes('/') || folderName.includes('\\')) return '폴더 이름에는 / 또는 \\ 문자를 사용할 수 없습니다.';
  if (folderName === '.' || folderName === '..') return '이 이름은 폴더 이름으로 사용할 수 없습니다.';
  return null;
}

async function createStorageFolder(
  currentUser: CurrentUser,
  parentPath: string,
  folderName: string,
): Promise<AdminStorageCreateFolderResponse> {
  const token = await currentUser.getIdToken();
  const response = await fetch('/api/admin/storage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parentPath, folderName }),
  });
  const payload = (await response.json().catch(() => ({}))) as AdminStorageCreateFolderResponse | AdminStorageErrorResponse;

  if (!response.ok || payload.ok !== true) {
    throw new Error('error' in payload ? payload.error : '폴더를 만들지 못했습니다.');
  }

  return payload;
}

function MediaPreview({
  node,
  previewUrl,
  compact = false,
}: {
  node: StorageNode;
  previewUrl?: string;
  compact?: boolean;
}) {
  if (node.type === 'folder') {
    return (
      <PreviewFrame $tone="folder">
        <FolderOpen size={compact ? 28 : 38} />
      </PreviewFrame>
    );
  }

  if (previewUrl && isImageStorageFile(node.file)) {
    return (
      <PreviewFrame $tone="image">
        {/* Signed Storage URLs are short-lived, so Next Image optimization is not useful here. */}
        { }
        <img src={previewUrl} alt="" loading="lazy" />
      </PreviewFrame>
    );
  }

  if (previewUrl && isVideoStorageFile(node.file)) {
    return (
      <PreviewFrame $tone="video">
        <video src={previewUrl} muted playsInline preload="metadata" />
        <span className="video-badge">
          <FileVideo2 size={12} />
          영상
        </span>
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame $tone="file">
      <span className="fallback">
        <FileTypeIcon file={node.file} size={compact ? 22 : 30} />
      </span>
    </PreviewFrame>
  );
}

export default function AdminStoragePage() {
  const { loginWithGoogle, isConfigured } = useAuth();
  const { currentUser, isAdmin, isCheckingAdmin } = useAdminAccess();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState(ROOT_NODE_ID);
  const [selectedId, setSelectedId] = useState(ROOT_NODE_ID);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderNameError, setFolderNameError] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const storageQuery = useQuery({
    queryKey: ['admin-storage-browser', currentUser?.uid ?? 'anonymous'],
    enabled: Boolean(currentUser && isAdmin),
    retry: false,
    queryFn: () => fetchStorageInventory(currentUser!),
  });

  const tree = useMemo(() => buildStorageTree(storageQuery.data?.files ?? []), [storageQuery.data?.files]);
  const keyword = searchTerm.trim().toLocaleLowerCase('ko-KR');
  const currentFolder = useMemo(() => {
    const found = findNode(tree, currentFolderId);
    return found?.type === 'folder' ? found : tree;
  }, [currentFolderId, tree]);
  const breadcrumbs = useMemo(() => getBreadcrumbs(tree, currentFolder), [currentFolder, tree]);
  const selectedNode = useMemo(() => findNode(tree, selectedId) ?? currentFolder, [currentFolder, selectedId, tree]);
  const displayedItems = useMemo(
    () => (keyword ? collectMatchingNodes(tree, keyword) : currentFolder.children),
    [currentFolder.children, keyword, tree],
  );
  const folderItems = useMemo(() => displayedItems.filter((item) => item.type === 'folder'), [displayedItems]);
  const fileItems = useMemo(() => displayedItems.filter((item) => item.type === 'file'), [displayedItems]);
  const previewCandidates = useMemo(() => {
    const paths = displayedItems
      .filter((item) => item.type === 'file' && isPreviewableMedia(item.file))
      .map((item) => item.path)
      .slice(0, PREVIEW_LIMIT);

    if (
      selectedNode.type === 'file' &&
      isPreviewableMedia(selectedNode.file) &&
      !paths.includes(selectedNode.path)
    ) {
      return [selectedNode.path, ...paths].slice(0, PREVIEW_LIMIT);
    }

    return paths;
  }, [displayedItems, selectedNode]);
  const previewCandidateKey = previewCandidates.join('\n');

  useEffect(() => {
    if (!storageQuery.data) return;
    setCurrentFolderId((prev) => {
      const found = findNode(tree, prev);
      return found?.type === 'folder' ? prev : ROOT_NODE_ID;
    });
    setSelectedId((prev) => (findNode(tree, prev) ? prev : ROOT_NODE_ID));
    setPreviewUrls({});
  }, [storageQuery.data, tree]);

  useEffect(() => {
    if (!currentUser || previewCandidates.length === 0) return;

    const missingPaths = previewCandidates.filter((path) => !previewUrls[path]);
    if (missingPaths.length === 0) return;

    let didCancel = false;

    const loadPreviews = async () => {
      const entries = await Promise.all(
        missingPaths.map(async (path) => {
          try {
            const payload = await fetchSignedFileUrl(currentUser, path);
            return [path, payload.url] as const;
          } catch {
            return null;
          }
        }),
      );

      if (didCancel) return;

      setPreviewUrls((prev) => {
        const next = { ...prev };
        entries.forEach((entry) => {
          if (entry) next[entry[0]] = entry[1];
        });
        return next;
      });
    };

    void loadPreviews();

    return () => {
      didCancel = true;
    };
  }, [currentUser, previewCandidateKey, previewCandidates, previewUrls]);

  const openFolder = (node: StorageNode) => {
    if (node.type !== 'folder') return;
    setSearchTerm('');
    setCurrentFolderId(node.id);
    setSelectedId(node.id);
  };

  const selectNode = (node: StorageNode) => {
    setSelectedId(node.id);
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} 복사했습니다.`);
    } catch {
      toast.error('클립보드 복사에 실패했습니다.');
    }
  };

  const copySelectedPath = () => {
    const bucket = storageQuery.data?.bucket;
    if (!bucket) return;

    if (selectedNode.id === ROOT_NODE_ID) {
      void copyText(`gs://${bucket}`, '버킷 경로를');
      return;
    }

    const suffix = selectedNode.type === 'folder' ? `${selectedNode.path}/` : selectedNode.path;
    void copyText(`gs://${bucket}/${suffix}`, 'Storage 경로를');
  };

  const openFileNode = async (node: StorageNode) => {
    if (!currentUser || node.type !== 'file' || !node.file) return;

    setOpeningPath(node.path);
    try {
      const payload = await fetchSignedFileUrl(currentUser, node.path);
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '파일을 열지 못했습니다.');
    } finally {
      setOpeningPath(null);
    }
  };

  const downloadFileNode = async (node: StorageNode) => {
    if (!currentUser || node.type !== 'file' || !node.file) return;

    setDownloadingPath(node.path);
    try {
      const payload = await fetchSignedFileUrl(currentUser, node.path, { download: true });
      const link = document.createElement('a');
      link.href = payload.url;
      link.download = node.name;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '파일을 다운로드하지 못했습니다.');
    } finally {
      setDownloadingPath(null);
    }
  };

  const openUploadPicker = () => {
    if (isUploading) return;
    setSearchTerm('');
    uploadInputRef.current?.click();
  };

  const handleUploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentUser) return;

    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setIsUploading(true);
    setSearchTerm('');

    try {
      let lastUploadedPath = '';

      for (const file of files) {
        const uploadFileName = normalizeUploadFileName(file.name);
        if (!uploadFileName) {
          throw new Error(`업로드할 수 없는 파일명입니다: ${file.name || '(이름 없음)'}`);
        }

        const uploadPath = buildStorageFilePath(currentFolder.path, uploadFileName);
        await uploadBytes(storageRef(storage, uploadPath), file, {
          contentType: file.type || 'application/octet-stream',
        });
        lastUploadedPath = uploadPath;
      }

      if (lastUploadedPath) {
        setSelectedId(`file:${lastUploadedPath}`);
      }

      toast.success(`${files.length.toLocaleString('ko-KR')}개 파일을 업로드했습니다.`);
      void storageQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '파일 업로드에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const openCreateFolderDialog = () => {
    setSearchTerm('');
    setFolderName('');
    setFolderNameError(null);
    setIsFolderDialogOpen(true);
  };

  const closeCreateFolderDialog = () => {
    if (isCreatingFolder) return;
    setIsFolderDialogOpen(false);
    setFolderName('');
    setFolderNameError(null);
  };

  const handleCreateFolderSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) return;

    const nextFolderName = folderName.trim();
    const validationError = validateFolderName(nextFolderName);
    if (validationError) {
      setFolderNameError(validationError);
      return;
    }

    const hasDuplicate = currentFolder.children.some((child) => child.type === 'folder' && child.name === nextFolderName);
    if (hasDuplicate) {
      setFolderNameError('같은 위치에 이미 존재하는 폴더입니다.');
      return;
    }

    setIsCreatingFolder(true);
    setFolderNameError(null);

    try {
      const payload = await createStorageFolder(currentUser, currentFolder.path, nextFolderName);
      const createdFolderPath = payload.path.replace(/\/+$/, '');
      const createdFolderId = createdFolderPath ? `folder:${createdFolderPath}` : ROOT_NODE_ID;

      setIsFolderDialogOpen(false);
      setFolderName('');
      setCurrentFolderId(createdFolderId);
      setSelectedId(createdFolderId);
      toast.success(`"${nextFolderName}" 폴더를 만들었습니다.`);
      void storageQuery.refetch();
    } catch (error) {
      setFolderNameError(error instanceof Error ? error.message : '폴더를 만들지 못했습니다.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  if (isCheckingAdmin) {
    return (
      <PageShell>
        <AccessState>
          <div className="box">
            <span className="icon">
              <Spinner size={24} />
            </span>
            <h1>Storage 권한 확인 중</h1>
            <p>관리자 권한과 Firebase 연결 상태를 확인하고 있습니다.</p>
          </div>
        </AccessState>
      </PageShell>
    );
  }

  if (!isConfigured) {
    return (
      <PageShell>
        <AccessState>
          <div className="box">
            <span className="icon">
              <AlertTriangle size={24} />
            </span>
            <h1>Firebase 설정 필요</h1>
            <p>Storage 목록을 읽으려면 Firebase 환경 변수가 먼저 설정되어야 합니다.</p>
          </div>
        </AccessState>
      </PageShell>
    );
  }

  if (!currentUser) {
    return (
      <PageShell>
        <AccessState>
          <div className="box">
            <span className="icon">
              <LogIn size={24} />
            </span>
            <h1>로그인이 필요합니다</h1>
            <p>관리자 Storage 탐색기는 로그인한 관리자만 사용할 수 있습니다.</p>
            <ActionButton type="button" $variant="primary" onClick={() => void loginWithGoogle()}>
              <LogIn size={16} />
              Google 로그인
            </ActionButton>
          </div>
        </AccessState>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell>
        <AccessState>
          <div className="box">
            <span className="icon">
              <ShieldCheck size={24} />
            </span>
            <h1>관리자 권한 필요</h1>
            <p>Storage 버킷 전체 목록은 관리자 계정에서만 확인할 수 있습니다.</p>
          </div>
        </AccessState>
      </PageShell>
    );
  }

  const bucketName = storageQuery.data?.bucket ?? '-';
  const isLoading = storageQuery.isLoading || storageQuery.isFetching;
  const hasItems = displayedItems.length > 0;
  const selectedPreviewUrl = selectedNode.type === 'file' ? previewUrls[selectedNode.path] : undefined;
  const createFolderPathLabel = currentFolder.id === ROOT_NODE_ID ? '/' : currentFolder.path;

  return (
    <PageShell>
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void handleUploadFiles(event);
        }}
      />
      <HeaderBand>
        <HeaderGrid>
          <TitleBlock>
            <div className="eyebrow">
              <HardDrive size={14} />
              Firebase Storage
            </div>
            <h1>Storage Drive</h1>
            <p>{bucketName === '-' ? '버킷을 불러오는 중입니다.' : bucketName}</p>
          </TitleBlock>

          <SearchBox>
            <Search size={16} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Storage 전체에서 파일과 폴더 검색"
              spellCheck={false}
            />
            {searchTerm ? (
              <button type="button" title="검색 지우기" aria-label="검색 지우기" onClick={() => setSearchTerm('')}>
                <X size={15} />
              </button>
            ) : null}
          </SearchBox>

          <ActionGroup>
            <ActionButton type="button" onClick={() => void storageQuery.refetch()} disabled={isLoading}>
              {isLoading ? <Spinner size={15} /> : <RefreshCw size={15} />}
              새로고침
            </ActionButton>
          </ActionGroup>
        </HeaderGrid>

        <SummaryStrip>
          <SummaryItem>
            <div className="value">{storageQuery.data?.totalFiles ?? 0}</div>
            <div className="label">파일</div>
          </SummaryItem>
          <SummaryItem>
            <div className="value">{tree.folderCount}</div>
            <div className="label">폴더</div>
          </SummaryItem>
          <SummaryItem>
            <div className="value">{formatBytes(storageQuery.data?.totalBytes ?? 0)}</div>
            <div className="label">전체 용량</div>
          </SummaryItem>
          <SummaryItem>
            <div className="value">{formatDate(storageQuery.data?.generatedAt)}</div>
            <div className="label">마지막 조회</div>
          </SummaryItem>
        </SummaryStrip>
      </HeaderBand>

      <ContentGrid>
        <DrivePanel>
          <DriveToolbar>
            <Breadcrumbs aria-label="Storage path">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.id}>
                  {index > 0 ? <ChevronRight size={14} color="#94a3b8" /> : null}
                  <CrumbButton
                    type="button"
                    $active={crumb.id === currentFolder.id && !keyword}
                    onClick={() => openFolder(crumb)}
                    title={crumb.id === ROOT_NODE_ID ? 'Storage root' : crumb.path}
                  >
                    {index === 0 ? <Home size={15} /> : <Folder size={15} />}
                    <span>{index === 0 ? '내 Storage' : crumb.name}</span>
                  </CrumbButton>
                </React.Fragment>
              ))}
            </Breadcrumbs>

            <div className="folder-title">
              {keyword ? <Search size={17} /> : currentFolder.id === ROOT_NODE_ID ? <HardDrive size={17} /> : <FolderOpen size={17} />}
              <span>{keyword ? '검색 결과' : currentFolder.id === ROOT_NODE_ID ? '내 Storage' : currentFolder.name}</span>
            </div>
            <ToolbarActions>
              <div className="toolbar-meta">
                {keyword
                  ? `${displayedItems.length.toLocaleString('ko-KR')}개 결과`
                  : `${folderItems.length.toLocaleString('ko-KR')}개 폴더 / ${fileItems.length.toLocaleString('ko-KR')}개 파일`}
              </div>
              <ActionButton
                type="button"
                onClick={openUploadPicker}
                disabled={!storageQuery.data || isLoading || isUploading}
              >
                {isUploading ? <Spinner size={15} /> : <Upload size={15} />}
                업로드
              </ActionButton>
              <ActionButton
                type="button"
                $variant="primary"
                onClick={openCreateFolderDialog}
                disabled={!storageQuery.data || isLoading || isCreatingFolder || isUploading}
              >
                <FolderPlus size={15} />
                새 폴더
              </ActionButton>
            </ToolbarActions>
          </DriveToolbar>

          {storageQuery.data?.hasMore ? (
            <LimitNotice>
              <AlertTriangle size={15} />
              {STORAGE_LIST_LIMIT.toLocaleString('ko-KR')}개까지만 표시 중입니다.
            </LimitNotice>
          ) : null}

          <DriveViewport>
            {storageQuery.isLoading ? (
              <EmptyState>
                <span className="icon">
                  <Spinner size={24} />
                </span>
                <h2>Storage 목록을 불러오는 중</h2>
                <p>버킷의 파일 경로를 읽고 Drive형 폴더 구조로 정리하고 있습니다.</p>
              </EmptyState>
            ) : storageQuery.error ? (
              <EmptyState>
                <span className="icon">
                  <AlertTriangle size={24} />
                </span>
                <h2>목록을 불러오지 못했습니다</h2>
                <p>{storageQuery.error instanceof Error ? storageQuery.error.message : '알 수 없는 오류가 발생했습니다.'}</p>
              </EmptyState>
            ) : !hasItems ? (
              <EmptyState>
                <span className="icon">
                  {keyword ? <Search size={24} /> : <HardDrive size={24} />}
                </span>
                <h2>{keyword ? '검색 결과 없음' : '이 폴더가 비어 있습니다'}</h2>
                <p>{keyword ? '다른 파일명이나 경로로 다시 검색해 보세요.' : '현재 위치에 표시할 폴더나 파일이 없습니다.'}</p>
              </EmptyState>
            ) : (
              <>
                {folderItems.length > 0 ? (
                  <SectionBlock>
                    <SectionHead>
                      <h2>{keyword ? '폴더 결과' : '폴더'}</h2>
                      <span>{folderItems.length.toLocaleString('ko-KR')}</span>
                    </SectionHead>
                    <FolderGrid>
                      {folderItems.map((folder) => (
                        <FolderTile
                          key={folder.id}
                          $selected={selectedNode.id === folder.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openFolder(folder)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openFolder(folder);
                            }
                          }}
                          title={folder.path || bucketName}
                        >
                          <span className="folder-icon">
                            <Folder size={19} />
                          </span>
                          <span className="folder-copy">
                            <span className="name">{folder.name}</span>
                            <span className="meta">
                              {folder.fileCount.toLocaleString('ko-KR')}개 파일 · {formatBytes(folder.totalBytes)}
                            </span>
                          </span>
                        </FolderTile>
                      ))}
                    </FolderGrid>
                  </SectionBlock>
                ) : null}

                {fileItems.length > 0 ? (
                  <SectionBlock>
                    <SectionHead>
                      <h2>{keyword ? '파일 결과' : '파일'}</h2>
                      <span>{fileItems.length.toLocaleString('ko-KR')}</span>
                    </SectionHead>
                    <FileGrid>
                      {fileItems.map((fileNode) => (
                        <FileTile
                          key={fileNode.id}
                          $selected={selectedNode.id === fileNode.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectNode(fileNode)}
                          onDoubleClick={() => {
                            selectNode(fileNode);
                            void openFileNode(fileNode);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              selectNode(fileNode);
                            }
                          }}
                          title={fileNode.path}
                        >
                          <div className="preview">
                            <MediaPreview node={fileNode} previewUrl={previewUrls[fileNode.path]} />
                          </div>
                          <div className="file-copy">
                            <div className="name">{fileNode.name}</div>
                            <div className="meta">
                              <span>{getFileKind(fileNode.file)}</span>
                              <span>{formatBytes(fileNode.sizeBytes)}</span>
                            </div>
                          </div>
                        </FileTile>
                      ))}
                    </FileGrid>
                  </SectionBlock>
                ) : null}
              </>
            )}
          </DriveViewport>
        </DrivePanel>

        <DetailPanel>
          <DetailHeader>
            <div className="detail-preview">
              {selectedNode.id === ROOT_NODE_ID ? (
                <PreviewFrame $tone="folder">
                  <HardDrive size={42} />
                </PreviewFrame>
              ) : selectedNode.type === 'folder' ? (
                <MediaPreview node={selectedNode} />
              ) : (
                <MediaPreview node={selectedNode} previewUrl={selectedPreviewUrl} />
              )}
            </div>
            <div>
              <h2>{selectedNode.id === ROOT_NODE_ID ? '내 Storage' : selectedNode.name}</h2>
              <p>{selectedNode.id === ROOT_NODE_ID ? bucketName : selectedNode.path}</p>
            </div>
          </DetailHeader>

          <DetailBody>
            <DetailActions>
              <ActionButton type="button" onClick={copySelectedPath} disabled={!storageQuery.data}>
                <Copy size={15} />
                경로 복사
              </ActionButton>
              <ActionButton
                type="button"
                onClick={() => void downloadFileNode(selectedNode)}
                disabled={selectedNode.type !== 'file' || downloadingPath === selectedNode.path}
              >
                {downloadingPath === selectedNode.path ? <Spinner size={15} /> : <Download size={15} />}
                다운로드
              </ActionButton>
              <ActionButton
                type="button"
                $variant="primary"
                onClick={() => void openFileNode(selectedNode)}
                disabled={selectedNode.type !== 'file' || openingPath === selectedNode.path}
              >
                {openingPath === selectedNode.path ? <Spinner size={15} /> : <ExternalLink size={15} />}
                파일 열기
              </ActionButton>
            </DetailActions>

            <DetailList>
              <div>
                <dt>Type</dt>
                <dd>{selectedNode.type === 'folder' ? '폴더' : getFileKind(selectedNode.file)}</dd>
              </div>
              <div>
                <dt>Bucket</dt>
                <dd>{bucketName}</dd>
              </div>
              <div>
                <dt>Path</dt>
                <dd>{selectedNode.id === ROOT_NODE_ID ? '/' : selectedNode.path}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(selectedNode.totalBytes)}</dd>
              </div>
              <div>
                <dt>Files</dt>
                <dd>{selectedNode.fileCount.toLocaleString('ko-KR')}</dd>
              </div>
              <div>
                <dt>Folders</dt>
                <dd>{selectedNode.folderCount.toLocaleString('ko-KR')}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(selectedNode.updatedAt)}</dd>
              </div>
              {selectedNode.file ? (
                <>
                  <div>
                    <dt>MIME</dt>
                    <dd>{selectedNode.file.contentType ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(selectedNode.file.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Generation</dt>
                    <dd>{selectedNode.file.generation ?? '-'}</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt>Children</dt>
                  <dd>{selectedNode.children.length.toLocaleString('ko-KR')}</dd>
                </div>
              )}
            </DetailList>

            <ActionButton
              type="button"
              $variant="quiet"
              onClick={() => void copyText(selectedNode.id === ROOT_NODE_ID ? bucketName : selectedNode.path, '표시 경로를')}
              disabled={!storageQuery.data}
            >
              <Clipboard size={15} />
              표시 경로 복사
            </ActionButton>
          </DetailBody>
        </DetailPanel>
      </ContentGrid>

      {isFolderDialogOpen ? (
        <DialogBackdrop onMouseDown={closeCreateFolderDialog}>
          <FolderDialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-storage-folder-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={handleCreateFolderSubmit}
          >
            <FolderDialogHeader>
              <div>
                <h2 id="create-storage-folder-title">새 폴더</h2>
                <p>{createFolderPathLabel}</p>
              </div>
              <IconButton type="button" aria-label="닫기" onClick={closeCreateFolderDialog} disabled={isCreatingFolder}>
                <X size={16} />
              </IconButton>
            </FolderDialogHeader>

            <FolderDialogBody>
              <label htmlFor="storage-folder-name">폴더 이름</label>
              <input
                id="storage-folder-name"
                value={folderName}
                onChange={(event) => {
                  setFolderName(event.target.value);
                  if (folderNameError) setFolderNameError(null);
                }}
                maxLength={STORAGE_FOLDER_NAME_LIMIT}
                placeholder="예: invoices"
                disabled={isCreatingFolder}
                autoFocus
              />
              {folderNameError ? <FieldError role="alert">{folderNameError}</FieldError> : null}
            </FolderDialogBody>

            <FolderDialogFooter>
              <ActionButton type="button" $variant="quiet" onClick={closeCreateFolderDialog} disabled={isCreatingFolder}>
                취소
              </ActionButton>
              <ActionButton type="submit" $variant="primary" disabled={isCreatingFolder}>
                {isCreatingFolder ? <Spinner size={15} /> : <FolderPlus size={15} />}
                만들기
              </ActionButton>
            </FolderDialogFooter>
          </FolderDialog>
        </DialogBackdrop>
      ) : null}
    </PageShell>
  );
}
