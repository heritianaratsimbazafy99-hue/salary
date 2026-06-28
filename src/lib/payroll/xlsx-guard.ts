import { createInflateRaw } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;
const ZIP64_UINT16_SENTINEL = 0xffff;
const ZIP64_UINT32_SENTINEL = 0xffffffff;

const EOCD_SIZE = 22;
const LOCAL_FILE_HEADER_SIZE = 30;
const CENTRAL_DIRECTORY_HEADER_SIZE = 46;

const COMPRESSION_METHOD_STORED = 0;
const COMPRESSION_METHOD_DEFLATE = 8;

const MAX_XLSX_ENTRIES = 512;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 15 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

const ERROR_MESSAGE = "XLSX workbook is too complex.";

type CentralDirectoryEntry = {
  compressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
  name: string;
};

export class XlsxContainerError extends Error {}

export async function assertSafeXlsxContainer(file: Blob): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const eocd = dataViewAt(bytes, eocdOffset, EOCD_SIZE);
  const diskNumber = eocd.getUint16(4, true);
  const centralDirectoryDisk = eocd.getUint16(6, true);
  const entriesOnDisk = eocd.getUint16(8, true);
  const entryCount = eocd.getUint16(10, true);
  const centralDirectorySize = eocd.getUint32(12, true);
  const centralDirectoryOffset = eocd.getUint32(16, true);
  const commentLength = eocd.getUint16(20, true);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  if (
    diskNumber === ZIP64_UINT16_SENTINEL ||
    centralDirectoryDisk === ZIP64_UINT16_SENTINEL ||
    entriesOnDisk === ZIP64_UINT16_SENTINEL ||
    entryCount === ZIP64_UINT16_SENTINEL ||
    centralDirectorySize === ZIP64_UINT32_SENTINEL ||
    centralDirectoryOffset === ZIP64_UINT32_SENTINEL ||
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    eocdOffset + EOCD_SIZE + commentLength !== bytes.byteLength ||
    entryCount === 0 ||
    entryCount > MAX_XLSX_ENTRIES ||
    centralDirectoryEnd !== eocdOffset
  ) {
    throwComplexityError();
  }

  const entries: CentralDirectoryEntry[] = [];
  const textDecoder = new TextDecoder();
  let cursor = centralDirectoryOffset;
  let declaredTotalUncompressed = 0;
  let hasWorkbook = false;
  let hasWorksheet = false;
  let hasContentTypes = false;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + CENTRAL_DIRECTORY_HEADER_SIZE > centralDirectoryEnd) {
      throwComplexityError();
    }

    const view = dataViewAt(bytes, cursor, CENTRAL_DIRECTORY_HEADER_SIZE);
    if (view.getUint32(0, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throwComplexityError();
    }

    const compressionMethod = view.getUint16(10, true);
    const compressedSize = view.getUint32(20, true);
    const declaredUncompressedSize = view.getUint32(24, true);
    const fileNameLength = view.getUint16(28, true);
    const extraLength = view.getUint16(30, true);
    const commentLength = view.getUint16(32, true);
    const diskStart = view.getUint16(34, true);
    const localHeaderOffset = view.getUint32(42, true);
    const nameStart = cursor + CENTRAL_DIRECTORY_HEADER_SIZE;
    const nameEnd = nameStart + fileNameLength;
    const extraEnd = nameEnd + extraLength;
    const recordEnd = extraEnd + commentLength;

    if (recordEnd > centralDirectoryEnd) {
      throwComplexityError();
    }

    if (
      compressedSize === ZIP64_UINT32_SENTINEL ||
      declaredUncompressedSize === ZIP64_UINT32_SENTINEL ||
      diskStart === ZIP64_UINT16_SENTINEL ||
      localHeaderOffset === ZIP64_UINT32_SENTINEL
    ) {
      throwComplexityError();
    }

    assertNoZip64ExtraField(bytes, nameEnd, extraEnd);

    if (declaredUncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throwComplexityError();
    }

    if (
      (compressedSize === 0 && declaredUncompressedSize > 0) ||
      (compressedSize > 0 && declaredUncompressedSize / compressedSize > MAX_COMPRESSION_RATIO)
    ) {
      throwComplexityError();
    }

    declaredTotalUncompressed += declaredUncompressedSize;
    if (declaredTotalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throwComplexityError();
    }

    const name = textDecoder.decode(bytes.subarray(nameStart, nameEnd));
    hasContentTypes ||= name === "[Content_Types].xml";
    hasWorkbook ||= name === "xl/workbook.xml";
    hasWorksheet ||= name.startsWith("xl/worksheets/") && name.endsWith(".xml");

    entries.push({
      compressedSize,
      compressionMethod,
      localHeaderOffset,
      name,
    });

    cursor = recordEnd;
  }

  if (cursor !== centralDirectoryEnd || !hasContentTypes || !hasWorkbook || !hasWorksheet) {
    throwComplexityError();
  }

  await assertActualEntryExpansion(bytes, entries, centralDirectoryOffset, textDecoder);
}

async function assertActualEntryExpansion(
  bytes: Uint8Array,
  entries: CentralDirectoryEntry[],
  centralDirectoryOffset: number,
  textDecoder: TextDecoder,
) {
  let totalUncompressed = 0;

  for (const entry of entries) {
    const compressedData = readLocalCompressedData(bytes, entry, centralDirectoryOffset, textDecoder);
    const maxOutputBytes = maxAllowedOutputBytes(entry.compressedSize, totalUncompressed);
    const actualUncompressedSize =
      entry.compressionMethod === COMPRESSION_METHOD_STORED
        ? compressedData.byteLength
        : await inflateRawWithLimit(compressedData, maxOutputBytes);

    if (actualUncompressedSize > maxOutputBytes) {
      throwComplexityError();
    }

    totalUncompressed += actualUncompressedSize;
  }
}

function readLocalCompressedData(
  bytes: Uint8Array,
  entry: CentralDirectoryEntry,
  centralDirectoryOffset: number,
  textDecoder: TextDecoder,
): Uint8Array {
  if (entry.localHeaderOffset + LOCAL_FILE_HEADER_SIZE > centralDirectoryOffset) {
    throwComplexityError();
  }

  const view = dataViewAt(bytes, entry.localHeaderOffset, LOCAL_FILE_HEADER_SIZE);
  if (view.getUint32(0, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throwComplexityError();
  }

  const compressionMethod = view.getUint16(8, true);
  const fileNameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const nameStart = entry.localHeaderOffset + LOCAL_FILE_HEADER_SIZE;
  const nameEnd = nameStart + fileNameLength;
  const extraEnd = nameEnd + extraLength;
  const dataStart = extraEnd;
  const dataEnd = dataStart + entry.compressedSize;

  if (compressionMethod !== entry.compressionMethod || dataEnd > centralDirectoryOffset) {
    throwComplexityError();
  }

  assertSupportedCompressionMethod(entry.compressionMethod);
  assertNoZip64ExtraField(bytes, nameEnd, extraEnd);

  const localName = textDecoder.decode(bytes.subarray(nameStart, nameEnd));
  if (localName !== entry.name) {
    throwComplexityError();
  }

  return bytes.subarray(dataStart, dataEnd);
}

function maxAllowedOutputBytes(compressedSize: number, totalUncompressed: number): number {
  const remainingTotal = MAX_TOTAL_UNCOMPRESSED_BYTES - totalUncompressed;
  if (remainingTotal < 0) {
    throwComplexityError();
  }

  const ratioLimit = compressedSize * MAX_COMPRESSION_RATIO;
  return Math.min(MAX_ENTRY_UNCOMPRESSED_BYTES, remainingTotal, ratioLimit);
}

function inflateRawWithLimit(compressedData: Uint8Array, maxOutputBytes: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const inflate = createInflateRaw();
    let outputBytes = 0;
    let settled = false;

    const rejectWithComplexityError = () => {
      if (settled) return;
      settled = true;
      inflate.destroy();
      reject(new XlsxContainerError(ERROR_MESSAGE));
    };

    inflate.on("data", (chunk: Uint8Array) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutputBytes) {
        rejectWithComplexityError();
      }
    });

    inflate.on("error", rejectWithComplexityError);
    inflate.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(outputBytes);
    });

    inflate.end(compressedData);
  });
}

function assertSupportedCompressionMethod(compressionMethod: number) {
  if (
    compressionMethod !== COMPRESSION_METHOD_STORED &&
    compressionMethod !== COMPRESSION_METHOD_DEFLATE
  ) {
    throwComplexityError();
  }
}

function assertNoZip64ExtraField(bytes: Uint8Array, start: number, end: number) {
  if (end > bytes.byteLength) {
    throwComplexityError();
  }

  let cursor = start;
  while (cursor < end) {
    if (cursor + 4 > end) {
      throwComplexityError();
    }

    const view = dataViewAt(bytes, cursor, 4);
    const fieldId = view.getUint16(0, true);
    const fieldSize = view.getUint16(2, true);
    const dataStart = cursor + 4;
    const dataEnd = dataStart + fieldSize;

    if (dataEnd > end || fieldId === ZIP64_EXTRA_FIELD_ID) {
      throwComplexityError();
    }

    cursor = dataEnd;
  }
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minOffset = Math.max(0, bytes.length - EOCD_SIZE - ZIP64_UINT16_SENTINEL);
  for (let offset = bytes.length - EOCD_SIZE; offset >= minOffset; offset -= 1) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
    if (view.getUint32(0, true) === EOCD_SIGNATURE) return offset;
  }

  throwComplexityError();
}

function dataViewAt(bytes: Uint8Array, offset: number, length: number): DataView {
  if (offset < 0 || offset + length > bytes.byteLength) {
    throwComplexityError();
  }

  return new DataView(bytes.buffer, bytes.byteOffset + offset, length);
}

function throwComplexityError(): never {
  throw new XlsxContainerError(ERROR_MESSAGE);
}
