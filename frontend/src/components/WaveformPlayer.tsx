import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'

interface WaveformPlayerProps {
  title: string
  url: string
  color: string
  downloadName: string
}

export function WaveformPlayer({ title, url, color, downloadName }: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    setIsReady(false)
    setIsPlaying(false)

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: `${color}66`,
      progressColor: color,
      cursorColor: '#e2e8f0',
      height: 56,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      url,
    })
    wsRef.current = ws

    ws.on('ready', () => setIsReady(true))
    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => setIsPlaying(false))

    return () => {
      ws.destroy()
      wsRef.current = null
    }
  }, [url, color])

  return (
    <div className="waveform-card">
      <div className="waveform-card-header">
        <span className="waveform-title">{title}</span>
        <div className="waveform-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => wsRef.current?.playPause()}
            disabled={!isReady}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <a className="icon-button" href={url} download={downloadName} aria-label="Download" title="Download">
            ↓
          </a>
        </div>
      </div>
      <div ref={containerRef} className="waveform-container" />
    </div>
  )
}
