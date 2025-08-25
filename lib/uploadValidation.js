// Upload validation helper: MIME whitelist, max size, optional image dimension constraints
// Minimal, no external image processing beyond 'image-size' (synchronous buffer read)
const path = require('path');
const { promisify } = require('util');
const fs = require('fs');
const sizeOf = require('image-size');

// Configuration (could later be moved to DB / env)
const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'application/pdf',
];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB default
const MAX_IMAGE_WIDTH = 6000;
const MAX_IMAGE_HEIGHT = 6000;

function validateBasic(file) {
  const errors = [];
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    errors.push(`MIME nicht erlaubt: ${file.mimetype}`);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(
      `Datei zu groß: ${(file.size / 1024 / 1024).toFixed(2)}MB > ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`
    );
  }
  return errors;
}

function validateImageDimensions(filePath) {
  try {
    const dim = sizeOf(filePath);
    if (dim.width > MAX_IMAGE_WIDTH || dim.height > MAX_IMAGE_HEIGHT) {
      return [
        `Bildmaße zu groß: ${dim.width}x${dim.height} > ${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT}`,
      ];
    }
    return [];
  } catch (e) {
    return ['Bilddimensionen konnten nicht gelesen werden'];
  }
}

async function validateUploadedFile(file) {
  // file: multer file object
  const basic = validateBasic(file);
  let extra = [];
  if (file.mimetype.startsWith('image/')) {
    extra = validateImageDimensions(file.path);
  }
  return [...basic, ...extra];
}

module.exports = {
  validateUploadedFile,
  ALLOWED_MIME,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_WIDTH,
  MAX_IMAGE_HEIGHT,
};
