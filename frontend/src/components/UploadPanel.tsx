import { useRef, useState, type DragEvent, type FormEvent } from 'react'

const EXAMPLE_PROMPTS = [
  'dog barking',
  'man speaking',
  'acoustic guitar',
  'car engine',
  'birds chirping',
  'applause',
]

interface UploadPanelProps {
  onSubmit: (file: File, description: string) => void
  isLoading: boolean
}

export function UploadPanel({ onSubmit, isLoading }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pickFile = (candidate: File | undefined | null) => {
    if (candidate) setFile(candidate)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    pickFile(event.dataTransfer.files?.[0])
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!file || !description.trim() || isLoading) return
    onSubmit(file, description.trim())
  }

  return (
    <form className="panel upload-panel" onSubmit={handleSubmit}>
      <h2>1. Upload &amp; describe</h2>

      <div
        className={`dropzone${isDragging ? ' dragging' : ''}${file ? ' has-file' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,video/*"
          hidden
          onChange={(event) => pickFile(event.target.files?.[0])}
        />
        {file ? (
          <>
            <div className="dropzone-filename">{file.name}</div>
            <div className="dropzone-hint">Click or drop to replace</div>
          </>
        ) : (
          <>
            <div className="dropzone-icon" aria-hidden>
              🎵
            </div>
            <div className="dropzone-hint">Drop an audio file here, or click to browse</div>
          </>
        )}
      </div>

      <label className="field-label" htmlFor="description">
        What sound do you want to isolate?
      </label>
      <input
        id="description"
        className="text-input"
        type="text"
        placeholder="e.g. dog barking"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        autoComplete="off"
      />

      <div className="chip-row">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button type="button" key={prompt} className="chip" onClick={() => setDescription(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <button type="submit" className="primary-button" disabled={!file || !description.trim() || isLoading}>
        {isLoading ? 'Separating…' : 'Separate audio'}
      </button>
    </form>
  )
}
