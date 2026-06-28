import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { assertSafeXlsxContainer } from "@/lib/payroll/xlsx-guard";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

type ZipEntryInput = {
  name: string;
  data?: string | Uint8Array;
  method?: 0 | 8;
  compressedData?: Uint8Array;
  declaredCompressedSize?: number;
  declaredUncompressedSize?: number;
  centralComment?: Uint8Array;
  centralExtra?: Uint8Array;
  declaredCentralCommentLength?: number;
  diskStart?: number;
  localExtra?: Uint8Array;
  localHeaderOffset?: number;
};

type ZipOptions = {
  centralDirectoryGap?: Uint8Array;
  declaredCentralDirectoryOffset?: number;
  declaredCentralDirectorySize?: number;
  eocdCentralDirectoryDisk?: number;
  eocdComment?: Uint8Array;
  eocdCommentLength?: number;
  eocdDiskNumber?: number;
  eocdEntriesOnDisk?: number;
  eocdEntryCount?: number;
  trailingBytes?: Uint8Array;
};

function zipWithEntries(entries: ZipEntryInput[], options: ZipOptions = {}) {
  const encoder = new TextEncoder();
  let nextLocalOffset = 0;

  const preparedEntries = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    const data = toBytes(entry.data ?? entry.name);
    const method = entry.method ?? 8;
    const compressedData = entry.compressedData ?? (method === 8 ? deflateRawSync(data) : data);
    const localExtra = entry.localExtra ?? new Uint8Array();
    const centralExtra = entry.centralExtra ?? new Uint8Array();
    const centralComment = entry.centralComment ?? new Uint8Array();
    const localHeaderOffset = nextLocalOffset;
    const declaredCompressedSize = entry.declaredCompressedSize ?? compressedData.byteLength;
    const declaredUncompressedSize = entry.declaredUncompressedSize ?? data.byteLength;
    const localHeader = new Uint8Array(30 + name.byteLength + localExtra.byteLength);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, method, true);
    localView.setUint32(18, declaredCompressedSize, true);
    localView.setUint32(22, declaredUncompressedSize, true);
    localView.setUint16(26, name.byteLength, true);
    localView.setUint16(28, localExtra.byteLength, true);
    localHeader.set(name, 30);
    localHeader.set(localExtra, 30 + name.byteLength);

    nextLocalOffset += localHeader.byteLength + compressedData.byteLength;

    return {
      centralComment,
      centralExtra,
      compressedData,
      declaredCentralCommentLength: entry.declaredCentralCommentLength ?? centralComment.byteLength,
      declaredCompressedSize,
      declaredUncompressedSize,
      diskStart: entry.diskStart ?? 0,
      localHeader,
      localHeaderOffset,
      method,
      name,
      nameText: entry.name,
      reportedLocalHeaderOffset: entry.localHeaderOffset ?? localHeaderOffset,
    };
  });

  const localParts = preparedEntries.flatMap((entry) => [entry.localHeader, entry.compressedData]);
  const localBytes = concatBytes(localParts);
  const centralDirectoryOffset = localBytes.byteLength;
  const centralParts = preparedEntries.map((entry) => {
    const buffer = new Uint8Array(
      46 + entry.name.byteLength + entry.centralExtra.byteLength + entry.centralComment.byteLength,
    );
    const view = new DataView(buffer.buffer);

    view.setUint32(0, CENTRAL_DIRECTORY_SIGNATURE, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(10, entry.method, true);
    view.setUint32(20, entry.declaredCompressedSize, true);
    view.setUint32(24, entry.declaredUncompressedSize, true);
    view.setUint16(28, entry.name.byteLength, true);
    view.setUint16(30, entry.centralExtra.byteLength, true);
    view.setUint16(32, entry.declaredCentralCommentLength, true);
    view.setUint16(34, entry.diskStart, true);
    view.setUint32(42, entry.reportedLocalHeaderOffset, true);
    buffer.set(entry.name, 46);
    buffer.set(entry.centralExtra, 46 + entry.name.byteLength);
    buffer.set(entry.centralComment, 46 + entry.name.byteLength + entry.centralExtra.byteLength);
    return buffer;
  });
  const centralDirectory = concatBytes(centralParts);
  const centralDirectoryGap = options.centralDirectoryGap ?? new Uint8Array();
  const eocdComment = options.eocdComment ?? new Uint8Array();
  const eocd = new Uint8Array(22 + eocdComment.byteLength);
  const eocdView = new DataView(eocd.buffer);

  eocdView.setUint32(0, EOCD_SIGNATURE, true);
  eocdView.setUint16(4, options.eocdDiskNumber ?? 0, true);
  eocdView.setUint16(6, options.eocdCentralDirectoryDisk ?? 0, true);
  eocdView.setUint16(8, options.eocdEntriesOnDisk ?? entries.length, true);
  eocdView.setUint16(10, options.eocdEntryCount ?? entries.length, true);
  eocdView.setUint32(12, options.declaredCentralDirectorySize ?? centralDirectory.byteLength, true);
  eocdView.setUint32(16, options.declaredCentralDirectoryOffset ?? centralDirectoryOffset, true);
  eocdView.setUint16(20, options.eocdCommentLength ?? eocdComment.byteLength, true);
  eocd.set(eocdComment, 22);

  return new Blob([
    concatBytes([
      localBytes,
      centralDirectory,
      centralDirectoryGap,
      eocd,
      options.trailingBytes ?? new Uint8Array(),
    ]),
  ]);
}

function workbookZip(
  overrides: {
    contentTypes?: Partial<ZipEntryInput>;
    workbook?: Partial<ZipEntryInput>;
    worksheet?: Partial<ZipEntryInput>;
  } = {},
  options?: ZipOptions,
) {
  return zipWithEntries(
    [
      {
        data: "<Types />",
        name: "[Content_Types].xml",
        ...overrides.contentTypes,
      },
      {
        data: "<workbook />",
        name: "xl/workbook.xml",
        ...overrides.workbook,
      },
      {
        data: "<worksheet />",
        name: "xl/worksheets/sheet1.xml",
        ...overrides.worksheet,
      },
    ],
    options,
  );
}

function zip64ExtraField() {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, 0x0001, true);
  return buffer;
}

function toBytes(value: string | Uint8Array) {
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }

  return result;
}

describe("assertSafeXlsxContainer", () => {
  it("accepts a small workbook-shaped zip", async () => {
    const file = workbookZip();

    await expect(assertSafeXlsxContainer(file)).resolves.toBeUndefined();
  });

  it("rejects excessive declared uncompressed size", async () => {
    const file = workbookZip({
      worksheet: {
        declaredCompressedSize: 1,
        declaredUncompressedSize: 80 * 1024 * 1024,
      },
    });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it("rejects non-empty entries with zero compressed size", async () => {
    const file = workbookZip({
      contentTypes: {
        declaredCompressedSize: 0,
        declaredUncompressedSize: 100,
      },
    });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it("rejects actual deflate output that exceeds the entry cap despite small declared metadata", async () => {
    const oversizedWorksheet = new Uint8Array(15 * 1024 * 1024 + 1);
    const file = workbookZip({
      worksheet: {
        compressedData: deflateRawSync(oversizedWorksheet),
        data: oversizedWorksheet,
        declaredUncompressedSize: 100,
      },
    });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it("rejects zip64 central size sentinels", async () => {
    const file = workbookZip({
      contentTypes: {
        declaredCompressedSize: 0xffffffff,
        declaredUncompressedSize: 0xffffffff,
      },
    });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it.each([
    ["EOCD disk number", { eocdDiskNumber: 0xffff }],
    ["EOCD central-directory disk", { eocdCentralDirectoryDisk: 0xffff }],
    ["EOCD entries on disk", { eocdEntriesOnDisk: 0xffff }],
    ["EOCD entry count", { eocdEntryCount: 0xffff }],
    ["EOCD central-directory size", { declaredCentralDirectorySize: 0xffffffff }],
    ["EOCD central-directory offset", { declaredCentralDirectoryOffset: 0xffffffff }],
  ] satisfies Array<[string, ZipOptions]>)("rejects %s zip64 sentinel", async (_label, options) => {
    const file = workbookZip({}, options);

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it.each([
    ["central-record disk start", { diskStart: 0xffff }],
    ["central-record local-header offset", { localHeaderOffset: 0xffffffff }],
    ["central-record Zip64 extra field", { centralExtra: zip64ExtraField() }],
    ["local-header Zip64 extra field", { localExtra: zip64ExtraField() }],
  ] satisfies Array<[string, Partial<ZipEntryInput>]>)("rejects %s", async (_label, contentTypes) => {
    const file = workbookZip({ contentTypes });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it("rejects a central directory truncated before a fixed record header", async () => {
    const file = workbookZip({}, { declaredCentralDirectorySize: 45 });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it("rejects central directory record metadata extending past the declared directory", async () => {
    const file = workbookZip({
      worksheet: {
        declaredCentralCommentLength: 1,
      },
    });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it("rejects trailing bytes that do not match the EOCD comment length", async () => {
    const file = workbookZip({}, { trailingBytes: new Uint8Array([1]) });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it("rejects EOCD comment lengths that extend beyond the file", async () => {
    const file = workbookZip({}, { eocdCommentLength: 1 });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it("rejects gaps between the central directory and EOCD", async () => {
    const file = workbookZip({}, { centralDirectoryGap: new Uint8Array([1]) });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });

  it("rejects central directories that overlap the EOCD", async () => {
    const centralDirectorySize = new Blob([
      new Uint8Array(46 + "[Content_Types].xml".length),
      new Uint8Array(46 + "xl/workbook.xml".length),
      new Uint8Array(46 + "xl/worksheets/sheet1.xml".length),
    ]).size;
    const file = workbookZip({}, { declaredCentralDirectorySize: centralDirectorySize + 1 });

    await expect(assertSafeXlsxContainer(file)).rejects.toThrow("XLSX workbook is too complex");
  });
});
