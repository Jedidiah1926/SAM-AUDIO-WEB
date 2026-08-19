import { useEffect, useRef, useState } from 'react'
import { fetchHealth, separateAudio, type HealthResponse, type SeparateResponse } from './api'
import { BackendSettings } from './components/BackendSettings'
import { UploadPanel } from './components/UploadPanel'
import { WaveformPlayer } from './components/WaveformPlayer'
import { separateLocally } from './mockEngine'

const BACKEND_URL_STORAGE_KEY = 'sam-audio-web:backend-url'

const CLIENT_MOCK_HEALTH: HealthResponse = {
  status: 'ok',
  engine: 'mock-client',
  engine_ready: true,
  model_name: null,
  device: null,
}

function revokeIfBlob(url: string | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

function App() {
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem(BACKEND_URL_STORAGE_KEY) ?? '')
  const [remoteHealth, setRemoteHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [result, setResult] = useState<SeparateResponse | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const objectUrlsRef = useRef<{ original: string | null; target: string | null; residual: string | null }>({
    original: null,
    target: null,
    residual: null,
  })

  useEffect(() => {
    if (!backendUrl) return
    let cancelled = false
    fetchHealth(backendUrl)
      .then((response) => {
        if (!cancelled) setRemoteHealth(response)
      })
      .catch((err) => {
        if (!cancelled) setHealthError(err instanceof Error ? err.message : 'Backend unreachable')
      })
    return () => {
      cancelled = true
    }
  }, [backendUrl])

  const health = backendUrl ? remoteHealth : CLIENT_MOCK_HEALTH

  const handleBackendUrlChange = (url: string) => {
    setBackendUrl(url)
    setRemoteHealth(null)
    setHealthError(null)
    if (url) {
      localStorage.setItem(BACKEND_URL_STORAGE_KEY, url)
    } else {
      localStorage.removeItem(BACKEND_URL_STORAGE_KEY)
    }
  }

  const handleSubmit = async (file: File, description: string) => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    revokeIfBlob(objectUrlsRef.current.original)
    revokeIfBlob(objectUrlsRef.current.target)
    revokeIfBlob(objectUrlsRef.current.residual)

    const nextOriginalUrl = URL.createObjectURL(file)
    objectUrlsRef.current.original = nextOriginalUrl
    setOriginalUrl(nextOriginalUrl)

    try {
      if (backendUrl) {
        const response = await separateAudio(backendUrl, file, description)
        objectUrlsRef.current.target = null
        objectUrlsRef.current.residual = null
        setResult(response)
      } else {
        const local = await separateLocally(file, description)
        objectUrlsRef.current.target = local.targetUrl
        objectUrlsRef.current.residual = local.residualUrl
        setResult({
          job_id: `local-${Date.now()}`,
          description,
          engine: 'mock-client',
          sample_rate: local.sampleRate,
          duration_seconds: local.durationSeconds,
          original_url: nextOriginalUrl,
          target_url: local.targetUrl,
          residual_url: local.residualUrl,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  const isMockEngine = !backendUrl || health?.engine === 'mock' || health?.engine === 'mock-client'
  const statusLabel = healthError
    ? 'Backend unreachable'
    : !backendUrl
      ? 'Demo mode (in-browser, no server)'
      : health
        ? `Live · ${health.model_name ?? health.engine}`
        : 'Connecting…'

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>SAM-Audio Web</h1>
          <p className="subtitle">
            Describe a sound in plain language and pull it out of a mix, powered by{' '}
            <a href="https://github.com/facebookresearch/sam-audio" target="_blank" rel="noreferrer">
              facebookresearch/sam-audio
            </a>
            .
          </p>
        </div>
        <div className="header-controls">
          <div className={`status-badge ${healthError ? 'status-error' : isMockEngine ? 'status-mock' : 'status-live'}`}>
            <span className="status-dot" />
            {statusLabel}
          </div>
          <BackendSettings backendUrl={backendUrl} onChange={handleBackendUrlChange} />
        </div>
      </header>

      {isMockEngine && !healthError && (
        <div className="mock-banner">
          {backendUrl ? (
            <>
              Connected to your backend, but it's currently serving the mock DSP engine (the real{' '}
              <code>sam_audio</code> package isn't installed there).
            </>
          ) : (
            <>
              Running a built-in, in-browser demo filter — not real separation. It works entirely client-side, which
              is why this page runs fine as a static GitHub Pages site. Click ⚙ to point it at your own SAM-Audio
              backend for real separation.
            </>
          )}
        </div>
      )}

      {healthError && (
        <div className="mock-banner status-error-banner">
          Could not reach <code>{backendUrl}</code>: {healthError}. Falling back isn't automatic — clear the backend
          URL (⚙) to use the in-browser demo instead.
        </div>
      )}

      <main className="main">
        <UploadPanel onSubmit={handleSubmit} isLoading={isLoading} />

        <section className="panel results-panel">
          <h2>2. Results</h2>

          {error && <div className="error-banner">{error}</div>}

          {!error && !originalUrl && (
            <div className="empty-state">Upload audio and describe a sound to get started.</div>
          )}

          {originalUrl && (
            <WaveformPlayer title="Original" url={originalUrl} color="#94a3b8" downloadName="original.wav" />
          )}

          {isLoading && (
            <div className="loading-state">
              <span className="spinner" /> Running separation…
            </div>
          )}

          {result && (
            <>
              <WaveformPlayer
                title={`Target — "${result.description}"`}
                url={result.target_url}
                color="#22d3ee"
                downloadName="target.wav"
              />
              <WaveformPlayer
                title="Residual (everything else)"
                url={result.residual_url}
                color="#f472b6"
                downloadName="residual.wav"
              />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
