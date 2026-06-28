import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the api layer: imageUpload.ts delegates the actual POST to these.
const apiMocks = vi.hoisted(() => ({
  uploadEntryImage: vi.fn().mockResolvedValue({ imageUrl: "u-entry" }),
  deleteEntryImage: vi.fn().mockResolvedValue({}),
  uploadHeaderImage: vi.fn().mockResolvedValue({ imageUrl: "u-header" }),
  uploadPromotionImage: vi.fn().mockResolvedValue({ imageUrl: "u-promo" }),
  uploadLocaleFlag: vi.fn().mockResolvedValue({ flagUrl: "u-flag" }),
}));

vi.mock("./api", () => apiMocks);

// Captures the (width, height) the production code asks the canvas to draw at.
let drawnSize: { width: number; height: number } | null;
let nextImageSize: { width: number; height: number };
const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
  drawnSize = null;
  nextImageSize = { width: 4000, height: 3000 };
  for (const m of Object.values(apiMocks)) m.mockClear();

  // jsdom has no real canvas/Image; stub just enough for resizeImage().
  // toBlob reads the canvas dims the production code set, so we can assert them.
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (cb: (b: Blob) => void) => {
          drawnSize = { width: canvas.width, height: canvas.height };
          cb({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)) } as unknown as Blob);
        },
      } as unknown as HTMLCanvasElement;
      return canvas;
    }
    return realCreateElement(tag);
  });

  // Image: fire onload on next tick using the configured natural size.
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 0;
    height = 0;
    set src(_v: string) {
      this.width = nextImageSize.width;
      this.height = nextImageSize.height;
      queueMicrotask(() => this.onload && this.onload());
    }
  }
  vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fakeFile() {
  return new File([new Uint8Array([0])], "p.jpg", { type: "image/jpeg" });
}

describe("imageUpload resize logic", () => {
  it("scales down a 4000x3000 image to fit 1920x1080 keeping aspect ratio", async () => {
    nextImageSize = { width: 4000, height: 3000 };
    const { uploadEntryImage } = await import("./imageUpload");
    await uploadEntryImage("e1", fakeFile());
    // width clamped to 1920 first -> height 1440, then height clamped to 1080 -> width 1440.
    expect(drawnSize).toEqual({ width: 1440, height: 1080 });
  });

  it("does not upscale an image already smaller than the max box", async () => {
    nextImageSize = { width: 800, height: 600 };
    const { uploadHeaderImage } = await import("./imageUpload");
    await uploadHeaderImage(fakeFile());
    expect(drawnSize).toEqual({ width: 800, height: 600 });
  });

  it("clamps locale flag to the 240x160 box", async () => {
    nextImageSize = { width: 1200, height: 800 };
    const { uploadLocaleFlag } = await import("./imageUpload");
    await uploadLocaleFlag("vec", fakeFile());
    expect(drawnSize).toEqual({ width: 240, height: 160 });
  });
});

describe("imageUpload wrappers post to the right endpoint and return the url", () => {
  it("uploadEntryImage forwards an ArrayBuffer to apiUploadEntryImage and returns imageUrl", async () => {
    const { uploadEntryImage } = await import("./imageUpload");
    const url = await uploadEntryImage("e1", fakeFile());
    expect(apiMocks.uploadEntryImage).toHaveBeenCalledOnce();
    expect(apiMocks.uploadEntryImage.mock.calls[0][0]).toBe("e1");
    expect(apiMocks.uploadEntryImage.mock.calls[0][1]).toBeInstanceOf(ArrayBuffer);
    expect(url).toBe("u-entry");
  });

  it("uploadHeaderImage returns the header imageUrl", async () => {
    const { uploadHeaderImage } = await import("./imageUpload");
    expect(await uploadHeaderImage(fakeFile())).toBe("u-header");
    expect(apiMocks.uploadHeaderImage).toHaveBeenCalledOnce();
  });

  it("uploadPromotionalImage returns the promotion imageUrl", async () => {
    const { uploadPromotionalImage } = await import("./imageUpload");
    expect(await uploadPromotionalImage(fakeFile())).toBe("u-promo");
    expect(apiMocks.uploadPromotionImage).toHaveBeenCalledOnce();
  });

  it("uploadLocaleFlag passes the code and returns flagUrl", async () => {
    const { uploadLocaleFlag } = await import("./imageUpload");
    expect(await uploadLocaleFlag("vec", fakeFile())).toBe("u-flag");
    expect(apiMocks.uploadLocaleFlag.mock.calls[0][0]).toBe("vec");
  });

  it("deleteEntryImage delegates to apiDeleteEntryImage and returns true", async () => {
    const { deleteEntryImage } = await import("./imageUpload");
    expect(await deleteEntryImage("e1")).toBe(true);
    expect(apiMocks.deleteEntryImage).toHaveBeenCalledWith("e1");
  });
});
