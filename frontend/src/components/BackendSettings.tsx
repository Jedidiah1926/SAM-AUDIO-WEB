import { useState, type FormEvent } from 'react'

interface BackendSettingsProps {
  backendUrl: string
  onChange: (url: string) => void
}

export function BackendSettings({ backendUrl, onChange }: BackendSettingsProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(backendUrl)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onChange(draft.trim().replace(/\/+$/, ''))
    setOpen(false)
  }

  return (
    <div className="settings">
      <button
        type="button"
        className="icon-button"
        onClick={() => {
          setDraft(backendUrl)
          setOpen((value) => !value)
        }}
        aria-label="Backend settings"
        title="Backend settings"
      >
        ⚙
      </button>

      {open && (
        <form className="settings-panel" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="backend-url">
            Backend URL (optional)
          </label>
          <input
            id="backend-url"
            className="text-input"
            type="url"
            inputMode="url"
            placeholder="https://your-sam-audio-backend.example.com"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <p className="settings-hint">
            Leave empty to use the built-in in-browser demo filter (no server needed). Point this at your own
            SAM-Audio FastAPI backend for real separation — it must include this page&apos;s origin in{' '}
            <code>SAM_AUDIO_CORS_ORIGINS</code>.
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="chip"
              onClick={() => {
                setDraft('')
                onChange('')
                setOpen(false)
              }}
            >
              Use demo mode
            </button>
            <button type="submit" className="primary-button primary-button-small">
              Save
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
