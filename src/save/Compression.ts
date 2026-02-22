// Compression utilities — gzip via native CompressionStream API
// Base64 encoding for chunk data

export function uint8ToBase64(arr: Uint8Array): string {
  // Process in chunks to avoid call stack overflow on large arrays
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < arr.length; i += CHUNK) {
    const slice = arr.subarray(i, Math.min(i + CHUNK, arr.length));
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]);
    }
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

export function float32ToArray(arr: Float32Array): number[] {
  return Array.from(arr);
}

export function uint8ToArray(arr: Uint8Array): number[] {
  return Array.from(arr);
}

export function int32ToArray(arr: Int32Array): number[] {
  return Array.from(arr);
}

export function int16ToArray(arr: Int16Array): number[] {
  return Array.from(arr);
}

/** Compress a JSON string to gzipped Uint8Array */
export async function compressGzip(json: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** Decompress a gzipped Uint8Array to JSON string */
export async function decompressGzip(data: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(result);
}

/** Download a Uint8Array as a file */
export function downloadFile(data: Uint8Array, filename: string): void {
  const blob = new Blob([data as unknown as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a File as Uint8Array */
export function readFileAsUint8(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
