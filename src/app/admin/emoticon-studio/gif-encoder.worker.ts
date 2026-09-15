import { GIFEncoder, applyPalette, quantize } from 'gifenc';

type GifWorkerRequest =
  | { type: 'start'; repeat: number; total: number }
  | { type: 'frame'; rgba: ArrayBuffer; width: number; height: number; durationMs: number }
  | { type: 'finish' };

type GifWorkerResponse =
  | { type: 'ready' }
  | { type: 'frame-ack'; completed: number; total: number }
  | { type: 'complete'; bytes: ArrayBuffer }
  | { type: 'error'; message: string };

let gif: ReturnType<typeof GIFEncoder> | null = null;
let repeat = 0;
let total = 0;
let completed = 0;

function fail(error: unknown) {
  const response: GifWorkerResponse = {
    type: 'error',
    message: error instanceof Error ? error.message : 'GIF Worker 인코딩에 실패했습니다.',
  };
  self.postMessage(response);
  gif = null;
}

self.onmessage = (event: MessageEvent<GifWorkerRequest>) => {
  try {
    if (event.data.type === 'start') {
      gif = GIFEncoder();
      repeat = event.data.repeat;
      total = event.data.total;
      completed = 0;
      const ready: GifWorkerResponse = { type: 'ready' };
      self.postMessage(ready);
      return;
    }

    if (!gif) throw new Error('GIF 스트림이 시작되지 않았습니다.');

    if (event.data.type === 'frame') {
      const rgba = new Uint8ClampedArray(event.data.rgba);
      const palette = quantize(rgba, 256, {
        format: 'rgba4444',
        oneBitAlpha: true,
        clearAlpha: true,
      });
      const indexed = applyPalette(rgba, palette, 'rgba4444');
      const transparentIndex = palette.findIndex((color) => (color[3] ?? 255) === 0);
      const hasTransparency = transparentIndex >= 0;
      gif.writeFrame(indexed, event.data.width, event.data.height, {
        palette,
        transparent: hasTransparency,
        transparentIndex,
        delay: Math.max(20, event.data.durationMs || 100),
        repeat,
        dispose: hasTransparency ? 2 : 0,
      });
      completed += 1;
      const ack: GifWorkerResponse = { type: 'frame-ack', completed, total };
      self.postMessage(ack);
      return;
    }

    if (event.data.type === 'finish') {
      gif.finish();
      const bytes = gif.bytes().slice().buffer as ArrayBuffer;
      gif = null;
      const complete: GifWorkerResponse = { type: 'complete', bytes };
      self.postMessage(complete, { transfer: [bytes] });
      return;
    }
    throw new Error('알 수 없는 GIF Worker 요청입니다.');
  } catch (error) {
    fail(error);
  }
};

export {};
