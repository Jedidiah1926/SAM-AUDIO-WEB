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

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error('Health check failed')
  return res.json()
}

export async function separateAudio(file: File, description: string): Promise<SeparateResponse> {
  const form = new FormData()
  form.append('audio', file)
  form.append('description', description)

  const res = await fetch('/api/separate', { method: 'POST', body: form })
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
  return res.json()
}
