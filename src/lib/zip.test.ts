import { describe, expect, it } from "vitest";

import { crc32, zip } from "./zip";

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("zip", () => {
  it("writes stored entries with a central directory pointing at them", async () => {
    const a = new TextEncoder().encode("hello");
    const b = new Uint8Array([1, 2, 3]);
    const bytes = new Uint8Array(await zip([{ name: "dir/a.txt", bytes: a }, { name: "é.bin", bytes: b }]).arrayBuffer());
    const view = new DataView(bytes.buffer);

    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralOffset = view.getUint32(end + 16, true);

    // Second central header → second local header → its data.
    const firstNameLength = view.getUint16(centralOffset + 28, true);
    const second = centralOffset + 46 + firstNameLength;
    expect(view.getUint32(second, true)).toBe(0x02014b50);
    const local = view.getUint32(second + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const nameLength = view.getUint16(local + 26, true);
    expect(new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + nameLength))).toBe("é.bin");
    expect([...bytes.subarray(local + 30 + nameLength, local + 33 + nameLength)]).toEqual([1, 2, 3]);
    expect(view.getUint32(local + 14, true)).toBe(crc32(b));
  });
});
