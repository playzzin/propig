import JSZip from 'jszip';

type ZipWorkerRequest =
  | { type: 'add'; id: number; path: string; data: string | ArrayBuffer }
  | { type: 'generate'; compressionLevel: number };

type ZipWorkerResponse =
  | { type: 'added'; id: number }
  | { type: 'progress'; percent: number }
  | { type: 'complete'; bytes: ArrayBuffer }
  | { type: 'error'; message: string };

const zip = new JSZip();

self.onmessage = async (event: MessageEvent<ZipWorkerRequest>) => {
  try {
    if (event.data.type === 'add') {
      zip.file(event.data.path, event.data.data);
      const response: ZipWorkerResponse = { type: 'added', id: event.data.id };
      self.postMessage(response);
      return;
    }
    const bytes = await zip.generateAsync(
      { type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: event.data.compressionLevel } },
      (metadata) => {
        const progress: ZipWorkerResponse = { type: 'progress', percent: metadata.percent };
        self.postMessage(progress);
      },
    );
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const response: ZipWorkerResponse = { type: 'complete', bytes: buffer };
    self.postMessage(response, { transfer: [buffer] });
  } catch (error) {
    const response: ZipWorkerResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : 'ZIP Worker 압축에 실패했습니다.',
    };
    self.postMessage(response);
  }
};

export {};
