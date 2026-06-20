export type AdminStorageFile = {
  path: string;
  name: string;
  bucket: string;
  contentType: string | null;
  sizeBytes: number;
  createdAt: string | null;
  updatedAt: string | null;
  md5Hash: string | null;
  generation: string | null;
};

export type AdminStorageListResponse = {
  ok: true;
  bucket: string;
  generatedAt: string;
  limit: number;
  hasMore: boolean;
  totalFiles: number;
  totalBytes: number;
  prefix: string | null;
  files: AdminStorageFile[];
};

export type AdminStorageUrlResponse = {
  ok: true;
  bucket: string;
  path: string;
  url: string;
  expiresAt: string;
};

export type AdminStorageCreateFolderResponse = {
  ok: true;
  bucket: string;
  path: string;
};

export type AdminStorageErrorResponse = {
  ok: false;
  error: string;
};

export type AdminStorageResponse =
  | AdminStorageListResponse
  | AdminStorageUrlResponse
  | AdminStorageCreateFolderResponse
  | AdminStorageErrorResponse;
