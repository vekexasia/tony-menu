import {
  deleteEntryImage as apiDeleteEntryImage,
  uploadEntryImage as apiUploadEntryImage,
  uploadHeaderImage as apiUploadHeaderImage,
  uploadPromotionImage as apiUploadPromotionImage,
  uploadLocaleFlag as apiUploadLocaleFlag,
  uploadMenuImage as apiUploadMenuImage,
} from "./api";

/**
 * Resize an image to max dimensions while maintaining aspect ratio.
 */
async function resizeImage(file: File, maxWidth: number = 1920, maxHeight: number = 1080): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (resized) => resized ? resolve(resized) : reject(new Error("Could not create blob from canvas")),
        "image/jpeg",
        0.90,
      );
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });

  return blob.arrayBuffer();
}

export async function uploadEntryImage(entryId: string, file: File): Promise<string> {
  const resizedImage = await resizeImage(file);
  const response = await apiUploadEntryImage(entryId, resizedImage);
  return response.imageUrl;
}

export async function deleteEntryImage(entryId: string): Promise<boolean> {
  await apiDeleteEntryImage(entryId);
  return true;
}

export async function uploadHeaderImage(file: File): Promise<string> {
  const resizedImage = await resizeImage(file, 1920, 1080);
  const response = await apiUploadHeaderImage(resizedImage);
  return response.imageUrl;
}

export async function uploadPromotionalImage(file: File): Promise<string> {
  const resizedImage = await resizeImage(file, 1920, 1080);
  const response = await apiUploadPromotionImage(resizedImage);
  return response.imageUrl;
}

export async function uploadMenuImage(menuId: string, file: File): Promise<string> {
  const resized = await resizeImage(file, 1080, 1080);
  const response = await apiUploadMenuImage(menuId, resized);
  return response.iconUrl;
}

export async function uploadLocaleFlag(code: string, file: File): Promise<string> {
  const resized = await resizeImage(file, 240, 160);
  const response = await apiUploadLocaleFlag(code, resized);
  return response.flagUrl;
}
