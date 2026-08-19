# SAM-Audio Web

A web app for text-prompted audio source separation, built around Meta's
[SAM-Audio](https://github.com/facebookresearch/sam-audio) model. Upload an
audio clip, describe the sound you want ("dog barking", "acoustic guitar"),
and get back two files: the isolated **target** sound and the **residual**
(everything else).

```
frontend (React + Vite)  --/api-->  backend (FastAPI)  --.separate()-->  SAM-Audio
```

## Two engines

SAM-Audio's checkpoints are gated on HuggingFace and the model expects a CUDA
GPU, so this project ships two interchangeable separation engines behind one
API:

- **`sam_audio`** — the real model, via the `sam_audio` Python package.
- **`mock`** — a small deterministic DSP stand-in (a band-pass filter keyed
  off the text prompt) used automatically when `sam_audio` isn't installed.
  It exists purely so the upload → separate → playback pipeline can be built
  and tested without a GPU or model weights. The UI always shows a banner
  when it's active, and `/api/health` reports which engine is serving
  requests.

Set `SAM_AUDIO_ENGINE=auto` (default) to use the real model when available
and fall back to the mock otherwise, or force one explicitly (`sam_audio` /
`mock`).

## Running with real SAM-Audio

1. Request access to the checkpoints on the [SAM-Audio HuggingFace
   repo](https://huggingface.co/facebook/sam-audio-base), then
   `hf auth login`.
2. Install the model package (needs Python >= 3.11 and a CUDA GPU):
   ```bash
   git clone https://github.com/facebookresearch/sam-audio.git
   pip install ./sam-audio
   ```
3. In `backend/.env` (copy from `.env.example`), set:
   ```
   SAM_AUDIO_ENGINE=sam_audio
   SAM_AUDIO_MODEL_NAME=facebook/sam-audio-base   # or -small / -large, optionally -tv
   ```
4. Start the backend as usual — it will download and load the checkpoint on
   first request.

Without this setup, the app still runs end-to-end using the mock engine.

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # optional, defaults to the mock engine
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api/*` to `http://127.0.0.1:8000` in dev (see
`vite.config.ts`), so open http://localhost:5173 and both services talk to
each other with no CORS setup needed.

## Docker Compose

```bash
docker compose up --build
```

Frontend: http://localhost:8080, backend: http://localhost:8000. Set
`SAM_AUDIO_ENGINE=sam_audio` and `HF_TOKEN=...` in the environment (or a
`.env` file next to `docker-compose.yml`) to run the real model; uncomment
the GPU `deploy` block if the host has the NVIDIA Container Toolkit.

## API

- `GET /api/health` → `{ status, engine, engine_ready, model_name, device }`
- `POST /api/separate` (multipart form: `audio` file, `description` text,
  optional `reranking_candidates` int) → job metadata with URLs for the
  original/target/residual WAV files.
- `GET /api/results/{job_id}/{original|target|residual}.wav` → the audio
  files themselves.

Limits (`backend/.env`): `SAM_AUDIO_MAX_UPLOAD_MB` (default 50MB),
`SAM_AUDIO_MAX_AUDIO_SECONDS` (default 60s).

## Notes

- Audio I/O uses `soundfile` rather than `torchaudio.load/save`, since newer
  torchaudio versions require TorchCodec + a matching system FFmpeg install;
  `soundfile` covers wav/flac/ogg with no extra system dependencies.
- SAM-Audio itself is distributed under Meta's SAM License — see the
  [upstream repo](https://github.com/facebookresearch/sam-audio) for terms
  before using its checkpoints.
