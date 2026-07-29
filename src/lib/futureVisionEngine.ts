import type { SelfProfile } from '../types/self'
import { FUTURE_YEARS_AHEAD } from './brand'
import { buildFutureSummaryLine, toDashboardValue } from './profilePhrases'
import { parseDataUrl } from './profilePhotos'
import { geminiGenerateContent, GeminiApiError } from './selfEngine'

export const GEMINI_IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image'] as const

function clip(text: string, max: number): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Gemini 이미지 편집용 프롬프트 */
export function buildFutureVisionPrompt(profile: SelfProfile): string {
  const f = profile.future
  const summary = buildFutureSummaryLine(f)

  const lines = [
    `Edit this portrait photo to show how this same person might look ${FUTURE_YEARS_AHEAD} years in the future.`,
    'CRITICAL: Keep the same person recognizable — preserve facial structure and identity. Do not generate a different person.',
    'Mood: confident, calm, healthy, aspirational but realistic. Subtle maturity, not heavy aging or caricature.',
    'Lighting: natural portrait, soft professional light, clean background.',
    'No text, watermark, logo, or collage.',
  ]

  if (summary) lines.push(`Future self summary: ${summary}`)
  if (f.identityLine?.trim()) lines.push(`Identity: ${clip(f.identityLine, 200)}`)
  if (f.career?.trim()) lines.push(`Career: ${clip(f.career, 120)}`)
  if (f.achievement?.trim()) lines.push(`Achievement vibe: ${clip(f.achievement, 100)}`)
  if (f.typicalDay?.trim()) lines.push(`Daily life vibe: ${clip(f.typicalDay, 140)}`)
  if (f.traitsShift?.length) {
    lines.push(`Personality shift: ${f.traitsShift.slice(0, 3).map((t) => toDashboardValue(t, 16)).join(', ')}`)
  }
  if (f.adviceTone) lines.push(`Tone: grounded and forward-looking.`)

  lines.push('Output one edited portrait image only.')
  return lines.join('\n')
}

export function hasFutureVisionSource(profile: SelfProfile): boolean {
  const f = profile.future
  return Boolean(
    f.identityLine?.trim() ||
      f.typicalDay?.trim() ||
      f.career?.trim() ||
      f.achievement?.trim() ||
      f.throughline?.trim(),
  )
}

function extractImagePart(data: Record<string, unknown>): { base64: string; mimeType: string } | null {
  type Part = { inlineData?: { data?: string; mimeType?: string }; text?: string }
  const candidates = data.candidates as Array<{ content?: { parts?: Part[] } }> | undefined
  const parts = candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    if (part.inlineData?.data) {
      return {
        base64: part.inlineData.data,
        mimeType: part.inlineData.mimeType ?? 'image/png',
      }
    }
  }
  return null
}

export async function generateFutureVisionImage(
  apiKey: string,
  profile: SelfProfile,
  presentDataUrl: string,
): Promise<{ dataUrl: string; caption?: string }> {
  const key = apiKey.trim()
  if (!key) throw new GeminiApiError('BAD_KEY')

  const parsed = parseDataUrl(presentDataUrl)
  if (!parsed) throw new Error('사진 형식을 읽지 못했어요. 다시 올려주세요.')

  if (!hasFutureVisionSource(profile)) {
    throw new Error('미래의 나 프로필을 먼저 채워주세요. (정체성 한 줄 등)')
  }

  const prompt = buildFutureVisionPrompt(profile)
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  }

  let lastError: unknown
  for (const model of GEMINI_IMAGE_MODELS) {
    try {
      const data = await geminiGenerateContent(key, model, body, 'futureVision')
      const image = extractImagePart(data)
      if (!image) throw new GeminiApiError('EMPTY_RESPONSE')

      type Part = { text?: string }
      const parts = (data.candidates as Array<{ content?: { parts?: Part[] } }> | undefined)?.[0]?.content
        ?.parts
      const caption = parts?.map((p) => p.text?.trim()).filter(Boolean).join(' ')

      return {
        dataUrl: `data:${image.mimeType};base64,${image.base64}`,
        caption: caption || undefined,
      }
    } catch (e) {
      lastError = e
      const detail = e instanceof GeminiApiError ? e.httpDetail?.toLowerCase() ?? '' : ''
      const retryableModel =
        e instanceof GeminiApiError &&
        (e.httpStatus === 404 || detail.includes('not found') || detail.includes('not supported'))
      if (!retryableModel) throw e
    }
  }

  throw lastError instanceof Error ? lastError : new Error('미래 비전 이미지를 만들지 못했어요.')
}
