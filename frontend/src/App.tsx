import { useEffect, useRef, useState } from 'react'
import { fetchHealth, separateAudio, type HealthResponse, type SeparateResponse } from './api'
import { UploadPanel } from './components/UploadPanel'
import { WaveformPlayer } from './components/WaveformPlayer'

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [result, setResult] = useState<SeparateResponse | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const originalUrlRef = useRef<string | null>(null)

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  const handleSubmit = async (file: File, description: string) => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current)
    const nextOriginalUrl = URL.createObjectURL(file)
    originalUrlRef.current = nextOriginalUrl
    setOriginalUrl(nextOriginalUrl)

    try {
      const response = await separateAudio(file, description)
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  const isMock = health?.engine === 'mock'

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
        {health && (
          <div className={`status-badge ${isMock ? 'status-mock' : 'status-live'}`}>
            <span className="status-dot" />
            {isMock ? 'Demo mode (mock separation)' : `Live · ${health.model_name ?? health.engine}`}
          </div>
        )}
      </header>

      {isMock && (
        <div className="mock-banner">
          Running with the built-in DSP demo engine, not the real SAM-Audio model — its checkpoints are gated on
          HuggingFace and need a GPU. See the README to install{' '}
          <a href="https://github.com/facebookresearch/sam-audio" target="_blank" rel="noreferrer">
            sam-audio
          </a>{' '}
          and switch <code>SAM_AUDIO_ENGINE=sam_audio</code> for real separation.
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
