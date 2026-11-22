export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
export const MAX_RAW_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB raw upload cap
export const MAX_OPTIMIZED_OUTPUT_BYTES = 95 * 1024; // 95 KB binary target (comfortably under Firestore cap)

export interface CropOptions {
  zoom?: number; // 1.0 to 2.5
  offsetX?: number; // -0.5 to 0.5 normalized pan
  offsetY?: number; // -0.5 to 0.5 normalized pan
  outputSize?: number; // square pixel size, default 256
}

export interface OptimizedImageResult {
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export function validateImageFile(file: File): string | null {
  const nameLower = file.name.toLowerCase();
  const hasValidExt = ALLOWED_IMAGE_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
  const hasValidMime = ALLOWED_IMAGE_MIME_TYPES.includes(
    file.type.toLowerCase() as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
  );

  if (!hasValidMime && !hasValidExt) {
    return 'Unsupported file format. Please select a JPG, JPEG, PNG, or WebP photograph.';
  }

  if (file.size === 0) {
    return 'Selected file is empty. Please choose a valid photograph.';
  }

  if (file.size > MAX_RAW_UPLOAD_BYTES) {
    return 'Photograph is larger than 5 MB. Please choose a smaller image file.';
  }

  return null;
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.naturalWidth < 32 || img.naturalHeight < 32) {
        reject(new Error('Image resolution is too small. Please upload a clearer photo (at least 64×64 px).'));
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to read the selected image file. Please try another JPG, PNG, or WebP photo.'));
    };
    img.src = objectUrl;
  });
}

function estimateBase64Bytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl.length;
  const base64 = dataUrl.slice(commaIdx + 1);
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Renders a square centered crop (with zoom & pan offset) onto an HTML5 Canvas
 * and iteratively compresses to crisp JPEG within MAX_OPTIMIZED_OUTPUT_BYTES.
 */
export function renderCroppedAvatarDataUrl(
  img: HTMLImageElement,
  options: CropOptions = {},
): OptimizedImageResult {
  const outputSize = options.outputSize ?? 256;
  const zoom = Math.min(2.5, Math.max(1, options.zoom ?? 1));
  const offsetX = Math.min(0.45, Math.max(-0.45, options.offsetX ?? 0));
  const offsetY = Math.min(0.45, Math.max(-0.45, options.offsetY ?? 0));

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser canvas is unavailable for image processing.');
  }

  // White matte backdrop so transparent PNG/WebP portraits export cleanly to JPEG
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const minSide = Math.min(img.naturalWidth, img.naturalHeight);
  const cropSide = minSide / zoom;
  const maxShiftX = (img.naturalWidth - cropSide) / 2;
  const maxShiftY = (img.naturalHeight - cropSide) / 2;

  const sx = Math.max(
    0,
    Math.min(img.naturalWidth - cropSide, (img.naturalWidth - cropSide) / 2 - offsetX * maxShiftX * 2),
  );
  const sy = Math.max(
    0,
    Math.min(img.naturalHeight - cropSide, (img.naturalHeight - cropSide) / 2 - offsetY * maxShiftY * 2),
  );

  ctx.drawImage(img, sx, sy, cropSide, cropSide, 0, 0, outputSize, outputSize);

  // Step down JPEG quality gracefully until comfortably under byte cap
  let quality = 0.86;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  let sizeBytes = estimateBase64Bytes(dataUrl);

  while (sizeBytes > MAX_OPTIMIZED_OUTPUT_BYTES && quality > 0.42) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    sizeBytes = estimateBase64Bytes(dataUrl);
  }

  if (sizeBytes > MAX_OPTIMIZED_OUTPUT_BYTES) {
    // Fallback to slightly smaller dimensions if image is exceptionally dense
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = 192;
    smallCanvas.height = 192;
    const smallCtx = smallCanvas.getContext('2d');
    if (smallCtx) {
      smallCtx.fillStyle = '#FFFFFF';
      smallCtx.fillRect(0, 0, 192, 192);
      smallCtx.drawImage(canvas, 0, 0, 192, 192);
      dataUrl = smallCanvas.toDataURL('image/jpeg', 0.72);
      sizeBytes = estimateBase64Bytes(dataUrl);
    }
  }

  return {
    dataUrl,
    sizeBytes,
    width: outputSize,
    height: outputSize,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
