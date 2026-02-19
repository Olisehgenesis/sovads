export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
] as const

export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const
export const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogv', '.mov'] as const

export const MAX_VIDEO_DURATION_SECONDS = 30
export const MAX_VIDEO_SIZE_BYTES = 25 * 1024 * 1024 // 25MB
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

const ALL_MIME_TYPES = new Set<string>([
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
])

const ALL_EXTENSIONS = [...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_VIDEO_EXTENSIONS]

export function isAllowedCreativeMimeType(mimeType: string): boolean {
  return ALL_MIME_TYPES.has(mimeType.toLowerCase())
}

export function detectMediaTypeFromMime(mimeType: string): 'image' | 'video' | null {
  const normalized = mimeType.toLowerCase()
  if (ALLOWED_IMAGE_MIME_TYPES.includes(normalized as typeof ALLOWED_IMAGE_MIME_TYPES[number])) {
    return 'image'
  }
  if (ALLOWED_VIDEO_MIME_TYPES.includes(normalized as typeof ALLOWED_VIDEO_MIME_TYPES[number])) {
    return 'video'
  }
  return null
}

export function detectMediaTypeFromUrl(url: string): 'image' | 'video' | null {
  const normalized = url.trim().toLowerCase()
  for (const ext of ALLOWED_IMAGE_EXTENSIONS) {
    if (normalized.includes(ext)) return 'image'
  }
  for (const ext of ALLOWED_VIDEO_EXTENSIONS) {
    if (normalized.includes(ext)) return 'video'
  }
  return null
}

export function hasAllowedCreativeExtension(url: string): boolean {
  const normalized = url.trim().toLowerCase()
  return ALL_EXTENSIONS.some((ext) => normalized.includes(ext))
}

export function getAllowedCreativeFormatLabel(): string {
  return 'Images: JPG, PNG, WEBP, GIF. Videos: MP4, WEBM, OGV, MOV.'
}
