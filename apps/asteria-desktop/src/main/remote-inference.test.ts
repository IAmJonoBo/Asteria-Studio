import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { requestRemoteLayout } from "./remote-inference.js";

const createTempImage = async (): Promise<string> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "asteria-"));
  const filePath = path.join(tempDir, "page.bin");
  await fs.writeFile(filePath, Buffer.alloc(32, 128));
  return filePath;
};

describe("requestRemoteLayout", () => {
  const originalFetch = globalThis.fetch;
  const originalEndpoint = process.env.ASTERIA_REMOTE_LAYOUT_ENDPOINT;
  const originalToken = process.env.ASTERIA_REMOTE_LAYOUT_TOKEN;
  const originalTimeout = process.env.ASTERIA_REMOTE_LAYOUT_TIMEOUT_MS;

  beforeEach(() => {
    process.env.ASTERIA_REMOTE_LAYOUT_ENDPOINT = "https://example.com/layout";
    process.env.ASTERIA_REMOTE_LAYOUT_TOKEN = "test-token";
    process.env.ASTERIA_REMOTE_LAYOUT_TIMEOUT_MS = "250";
  });

  afterEach(() => {
    process.env.ASTERIA_REMOTE_LAYOUT_ENDPOINT = originalEndpoint;
    process.env.ASTERIA_REMOTE_LAYOUT_TOKEN = originalToken;
    process.env.ASTERIA_REMOTE_LAYOUT_TIMEOUT_MS = originalTimeout;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null when endpoint responds with error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false }) as unknown as typeof globalThis.fetch;
    const imagePath = await createTempImage();
    const result = await requestRemoteLayout("page-001", imagePath, 1000, 1200);
    expect(result).toBeNull();
  });

  it("maps remote elements to layout elements", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [{ id: "remote-1", type: "title", bbox: [10, 10, 100, 60], confidence: 0.9 }],
      }),
    }) as unknown as typeof globalThis.fetch;

    const imagePath = await createTempImage();
    const result = await requestRemoteLayout("page-002", imagePath, 800, 1000);
    expect(result?.length).toBe(1);
    expect(result?.[0].type).toBe("title");
    expect(result?.[0].source).toBe("remote");
  });

  it("returns null when config file cannot be read", async () => {
    process.env.ASTERIA_REMOTE_LAYOUT_ENDPOINT = "";
    process.env.ASTERIA_REMOTE_LAYOUT_TOKEN = "";
    process.env.ASTERIA_REMOTE_LAYOUT_TIMEOUT_MS = "";

    const statSpy = vi
      .spyOn(fs, "stat")
      .mockResolvedValue({ isFile: () => true } as unknown as Awaited<ReturnType<typeof fs.stat>>);
    const readSpy = vi.spyOn(fs, "readFile").mockRejectedValue(new Error("boom"));

    const imagePath = await createTempImage();
    const result = await requestRemoteLayout("page-003", imagePath, 800, 1000);
    expect(result).toBeNull();

    statSpy.mockRestore();
    readSpy.mockRestore();
  });

  it("returns null when no config file is found", async () => {
    process.env.ASTERIA_REMOTE_LAYOUT_ENDPOINT = "";
    process.env.ASTERIA_REMOTE_LAYOUT_TOKEN = "";
    process.env.ASTERIA_REMOTE_LAYOUT_TIMEOUT_MS = "";

    const statSpy = vi.spyOn(fs, "stat").mockRejectedValue(new Error("missing"));

    const imagePath = await createTempImage();
    const result = await requestRemoteLayout("page-004", imagePath, 800, 1000);
    expect(result).toBeNull();

    statSpy.mockRestore();
  });
});
