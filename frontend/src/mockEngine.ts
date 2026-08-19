/**
 * In-browser stand-in for real SAM-Audio separation, used when no backend
 * URL is configured. Runs entirely client-side via the Web Audio API: it
 * band-pass filters the input to produce a "target" and subtracts it to get
 * a "residual". The filter's center frequency is derived deterministically
 * from a hash of the text prompt, mirroring `backend/app/engine.py`'s
 * MockEngine so both demo paths behave consistently.
 *
 * This is *not* real source separation — it exists so the full upload ->
 * describe -> separate -> playback flow works on static hosting (GitHub
 * Pages) with zero server involved.
 */

export interface LocalSeparationResult {
  targetUrl: string
  residualUrl: string
  sampleRate: number
  durationSeconds: number
}

export async function separateLocally(file: File, description: string): Promise<LocalSeparationResult> {
  const arrayBuffer = await file.arrayBuffer()

  // decodeAudioData needs a live (non-offline) context.
  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) {
    throw new Error('This browser does not support the Web Audio API')
  }
  const decodeCtx = new AudioContextCtor()
  let decoded: AudioBuffer
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer)
  } catch {
    throw new Error('Could not decode this audio file in the browser')
  } finally {
    await decodeCtx.close()
  }

  const centerFrequency = await centerFrequencyFor(description, decoded.sampleRate)

  const OfflineCtor = window.OfflineAudioContext ?? (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!OfflineCtor) {
    throw new Error('This browser does not support OfflineAudioContext')
  }
  const offlineCtx = new OfflineCtor(decoded.numberOfChannels, decoded.length, decoded.sampleRate)
  const source = offlineCtx.createBufferSource()
  source.buffer = decoded
  const filter = offlineCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = centerFrequency
  filter.Q.value = 0.707
  source.connect(filter)
  filter.connect(offlineCtx.destination)
  source.start(0)

  const targetBuffer = await offlineCtx.startRendering()
  const residualBuffer = subtractBuffers(decoded, targetBuffer)

  const targetUrl = URL.createObjectURL(audioBufferToWavBlob(targetBuffer))
  const residualUrl = URL.createObjectURL(audioBufferToWavBlob(residualBuffer))

  return {
    targetUrl,
    residualUrl,
    sampleRate: decoded.sampleRate,
    durationSeconds: decoded.duration,
  }
}

async function centerFrequencyFor(description: string, sampleRate: number): Promise<number> {
  const normalized = description.trim().toLowerCase()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  const bytes = new Uint8Array(digest)
  const first4 = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0

  const nyquist = sampleRate / 2
  const span = Math.max(nyquist * 0.8 - 200, 1)
  return 200 + ((first4 % 10_000) / 10_000) * span
}

function subtractBuffers(a: AudioBuffer, b: AudioBuffer): AudioBuffer {
  const out = new AudioBuffer({
    numberOfChannels: a.numberOfChannels,
    length: a.length,
    sampleRate: a.sampleRate,
  })
  for (let channel = 0; channel < a.numberOfChannels; channel++) {
    const aData = a.getChannelData(channel)
    const bData = b.getChannelData(channel)
    const outData = out.getChannelData(channel)
    for (let i = 0; i < aData.length; i++) {
      outData[i] = aData[i] - bData[i]
    }
  }
  return out
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataLength = buffer.length * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(arrayBuffer)

  writeAsciiString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeAsciiString(view, 8, 'WAVE')
  writeAsciiString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeAsciiString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  const channelData: Float32Array[] = []
  for (let channel = 0; channel < numChannels; channel++) {
    channelData.push(buffer.getChannelData(channel))
  }

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

function writeAsciiString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i))
  }
}
