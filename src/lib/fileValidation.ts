// File type definitions
export type FileCategory = "musicxml" | "audio" | "image";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  category?: FileCategory;
}

// Size limits in bytes
const SIZE_LIMITS: Record<FileCategory, number> = {
  musicxml: 10 * 1024 * 1024, // 10MB
  audio: 50 * 1024 * 1024, // 50MB
  image: 20 * 1024 * 1024, // 20MB
};

// Allowed extensions (lowercase, with leading dot)
const ALLOWED_EXTENSIONS: Record<FileCategory, string[]> = {
  musicxml: [".xml", ".musicxml", ".mxl", ".mei"],
  audio: [".mp3", ".wav"],
  image: [".jpg", ".jpeg", ".png", ".webp"],
};

// MIME type to category mapping (fallback detection)
const MIME_TO_CATEGORY: Record<string, FileCategory> = {
  "application/xml": "musicxml",
  "text/xml": "musicxml",
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
  "audio/wav": "audio",
  "audio/wave": "audio",
  "audio/x-wav": "audio",
  "application/mei+xml": "musicxml",
  "application/x-mei+xml": "musicxml",
  "application/vnd.recordare.musicxml": "musicxml",
  "application/vnd.recordare.musicxml+xml": "musicxml",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
};

/**
 * Get the file extension from a filename (lowercase, with leading dot)
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Detect file category by extension first, then MIME type as fallback
 */
export function detectFileCategory(file: File): FileCategory | null {
  const extension = getExtension(file.name);

  // Check extension first (more reliable for MusicXML)
  for (const [category, extensions] of Object.entries(ALLOWED_EXTENSIONS)) {
    if (extensions.includes(extension)) {
      return category as FileCategory;
    }
  }

  // Fallback to MIME type
  const mimeCategory = MIME_TO_CATEGORY[file.type];
  if (mimeCategory) {
    return mimeCategory;
  }

  return null;
}

/**
 * Validate file size against category limits
 */
export function validateFileSize(
  file: File,
  category: FileCategory
): ValidationResult {
  const limit = SIZE_LIMITS[category];
  if (file.size > limit) {
    return {
      valid: false,
      error: `File is too large. Maximum size for ${category} files is ${formatFileSize(limit)}.`,
      category,
    };
  }
  return { valid: true, category };
}

/**
 * Validate that file extension is allowed
 */
export function validateFileExtension(file: File): ValidationResult {
  const category = detectFileCategory(file);

  if (!category) {
    const extension = getExtension(file.name) || "unknown";
    const allAllowed = Object.values(ALLOWED_EXTENSIONS).flat().join(", ");
    return {
      valid: false,
      error: `Unsupported file type "${extension}". Allowed types: ${allAllowed}`,
    };
  }

  return { valid: true, category };
}

/**
 * Full file validation: extension and size
 */
export function validateFile(file: File): ValidationResult {
  // First check extension
  const extensionResult = validateFileExtension(file);
  if (!extensionResult.valid) {
    return extensionResult;
  }

  // Then check size
  const category = extensionResult.category!;
  const sizeResult = validateFileSize(file, category);
  if (!sizeResult.valid) {
    return sizeResult;
  }

  return { valid: true, category };
}

/**
 * Format bytes into human-readable size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const size = bytes / Math.pow(k, i);
  // Use 1 decimal place for MB and GB, none for smaller units
  const decimals = i >= 2 ? 1 : 0;

  return `${size.toFixed(decimals)} ${units[i]}`;
}

/**
 * Get the size limit for a file category (for display purposes)
 */
export function getSizeLimit(category: FileCategory): number {
  return SIZE_LIMITS[category];
}

/**
 * Get human-readable size limit for a category
 */
export function getFormattedSizeLimit(category: FileCategory): string {
  return formatFileSize(SIZE_LIMITS[category]);
}
