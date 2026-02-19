import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { uploadImageToCloudinary } from '@/lib/cloudinary'
import {
  detectMediaTypeFromMime,
  isAllowedCreativeMimeType,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_SIZE_BYTES,
  getAllowedCreativeFormatLabel,
} from '@/lib/creative-validation'

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const { base64, filename, type } = await request.json()
      if (!base64 || !type) {
        return NextResponse.json({ error: 'base64 and type required' }, { status: 400 })
      }
      if (!isAllowedCreativeMimeType(type)) {
        return NextResponse.json(
          { error: `Unsupported media type. ${getAllowedCreativeFormatLabel()}` },
          { status: 400 }
        )
      }
      const upload = await uploadImageToCloudinary(base64, type, {
        filenameOverride: filename ?? undefined,
      })
      const detectedMediaType = detectMediaTypeFromMime(type)
      if (!detectedMediaType) {
        return NextResponse.json({ error: 'Could not determine media type' }, { status: 400 })
      }
      if (detectedMediaType === 'video' && (upload.duration || 0) > MAX_VIDEO_DURATION_SECONDS) {
        return NextResponse.json(
          { error: `Video must be ${MAX_VIDEO_DURATION_SECONDS}s or less` },
          { status: 400 }
        )
      }
      if (detectedMediaType === 'video' && (upload.bytes || 0) > MAX_VIDEO_SIZE_BYTES) {
        return NextResponse.json({ error: 'Video exceeds 25MB max size' }, { status: 400 })
      }
      if (detectedMediaType === 'image' && (upload.bytes || 0) > MAX_IMAGE_SIZE_BYTES) {
        return NextResponse.json({ error: 'Image exceeds 10MB max size' }, { status: 400 })
      }

      return NextResponse.json(
        {
          url: upload.secureUrl,
          publicId: upload.publicId,
          width: upload.width,
          height: upload.height,
          format: upload.format,
          mediaType: upload.resourceType === 'video' ? 'video' : 'image',
          bytes: upload.bytes,
          duration: upload.duration,
        },
        { status: 201 }
      )
    }

    // Fallback: multipart/form-data
    const form = await request.formData()
    const file = form.get('image') as File | null
    if (!file) {
      return NextResponse.json({ error: 'image file is required' }, { status: 400 })
    }
    if (!isAllowedCreativeMimeType(file.type || '')) {
      return NextResponse.json(
        { error: `Unsupported media type. ${getAllowedCreativeFormatLabel()}` },
        { status: 400 }
      )
    }
    const mediaType = detectMediaTypeFromMime(file.type || '')
    if (!mediaType) {
      return NextResponse.json({ error: 'Could not determine media type' }, { status: 400 })
    }
    if (mediaType === 'video' && file.size > MAX_VIDEO_SIZE_BYTES) {
      return NextResponse.json({ error: 'Video exceeds 25MB max size' }, { status: 400 })
    }
    if (mediaType === 'image' && file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image exceeds 10MB max size' }, { status: 400 })
    }
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const upload = await uploadImageToCloudinary(buffer, file.type || undefined, {
      filenameOverride: file.name ? `${file.name}-${randomUUID()}` : undefined,
    })
    if (mediaType === 'video' && (upload.duration || 0) > MAX_VIDEO_DURATION_SECONDS) {
      return NextResponse.json(
        { error: `Video must be ${MAX_VIDEO_DURATION_SECONDS}s or less` },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        url: upload.secureUrl,
        publicId: upload.publicId,
        width: upload.width,
        height: upload.height,
        format: upload.format,
        mediaType: upload.resourceType === 'video' ? 'video' : 'image',
        bytes: upload.bytes,
        duration: upload.duration,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}

