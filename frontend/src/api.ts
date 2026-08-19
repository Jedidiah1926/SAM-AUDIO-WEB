export interface HealthResponse {
  status: string
  engine: string
  engine_ready: boolean
  model_name: string | null
  device: string | null
}

export interface SeparateResponse {
  job_id: string
  description: string
  engine: string
  sample_rate: number
  duration_seconds: number
  original_url: string
  target_url: string
  residual_url: string
}

function normalizeBase(backendUrl: string): string {
  return backendUrl.trim().replace(/\/+$/, '')
}

function absoluteUrl(base: string, path: string): string {
  return /^https?:\/\//.test(path) ? path : `${base}${path}`
}

export async function fetchHealth(backendUrl: string): Promise<HealthResponse> {
  const base = normalizeBase(backendUrl)
  const res = await fetch(`${base}/api/health`)
  if (!res.ok) throw new Error(`Health check failed (${res.status})`)
  return res.json()
}

export async function separateAudio(
  backendUrl: string,
  file: File,
  description: string,
): Promise<SeparateResponse> {
  const base = normalizeBase(backendUrl)
  const form = new FormData()
  form.append('audio', file)
  form.append('description', description)

  const res = await fetch(`${base}/api/separate`, { method: 'POST', body: form })
  if (!res.ok) {
    let detail = `Separation failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.detail) detail = body.detail
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(detail)
  }

  const data = (await res.json()) as SeparateResponse
  return {
    ...data,
    original_url: absoluteUrl(base, data.original_url),
    target_url: absoluteUrl(base, data.target_url),
    residual_url: absoluteUrl(base, data.residual_url),
  }
}
