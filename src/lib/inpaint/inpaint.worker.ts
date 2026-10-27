import { inpaint } from "./patchmatch";

interface Request {
  id: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  mask: Uint8Array;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = (e) => {
  const { id, width, height, data, mask } = e.data;
  try {
    const out = inpaint(width, height, data, mask, {
      onProgress: (p) => scope.postMessage({ id, progress: p }),
    });
    scope.postMessage({ id, data: out }, [out.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
