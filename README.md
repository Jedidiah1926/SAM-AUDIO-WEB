# SAM-Audio Web

A web app for text-prompted audio source separation, built around Meta's
[SAM-Audio](https://github.com/facebookresearch/sam-audio) model. Upload an
audio clip, describe the sound you want ("dog barking", "acoustic guitar"),
and get back two files: the isolated **target** sound and the **residual**
(everything else).

The frontend is a static site (works on GitHub Pages, no server required).
By default it runs a small in-browser demo filter; optionally point it at
your own backend running the real SAM-Audio model for actual separation.

```
frontend (static, React + Vite)
  ├─ no backend configured → in-browser Web Audio mock engine
  └─ backend URL configured → /api/* on your FastAPI backend → SAM-Audio
```

## Two engines

SAM-Audio's checkpoints are gated on HuggingFace and the model expects a CUDA
GPU — not something a static GitHub Pages site can run. So the app ships two
interchangeable, API-compatible separation paths:

- **In-browser demo (default, no backend)** — `frontend/src/mockEngine.ts`
  band-pass filters the audio using the Web Audio API, entirely client-side.
  The filter's center frequency is a deterministic hash of the text prompt,
  so different prompts audibly differ. This is what runs when the site is
  deployed as-is to GitHub Pages.
- **Real backend** — `backend/` is a FastAPI service wrapping the actual
  `sam_audio` package (`SamAudioEngine` in `backend/app/engine.py`). It also
  has its own DSP mock (`MockEngine`) as a fallback when `sam_audio` isn't
  installed on it, used automatically until you set it up per below.

Click the **⚙ (settings)** button in the app header to enter a backend URL;
leave it empty to stay on the in-browser demo. The status badge always shows
which engine is actually serving requests, and a banner explains when you're
looking at demo output.

## Deploying the frontend to GitHub Pages

1. In the repo's **Settings → Pages**, set "Source" to **GitHub Actions**.
2. Push to `main` (or run the workflow manually) — `.github/workflows/deploy-pages.yml`
   builds `frontend/` and publishes `frontend/dist` to Pages.
3. Visit `https://<user>.github.io/<repo>/`. It works immediately with the
   in-browser demo engine, no configuration needed.

To wire it up to real SAM-Audio, deploy the backend somewhere with a GPU
(see below), then open the deployed site, click ⚙, and paste that backend's
URL.

## Running real SAM-Audio as a backend

1. Request access to the checkpoints on the [SAM-Audio HuggingFace
   repo](https://huggingface.co/facebook/sam-audio-base), then
   `hf auth login`.
2. Install the model package (needs Python >= 3.11 and a CUDA GPU):
   ```bash
   git clone https://github.com/facebookresearch/sam-audio.git
   pip install ./sam-audio
   ```
3. In `backend/.env` (copy from `backend/.env.example`), set:
   ```
   SAM_AUDIO_ENGINE=sam_audio
   SAM_AUDIO_MODEL_NAME=facebook/sam-audio-base   # or -small / -large, optionally -tv
   SAM_AUDIO_CORS_ORIGINS=https://<user>.github.io,http://localhost:5173
   ```
4. Deploy the backend (a host with a GPU — this is not something GitHub
   Pages or any static host can run) and point the frontend's ⚙ settings at
   its public URL.

Without any of this, the app still runs end-to-end using the in-browser mock
engine — nothing above is required to try it out.

## Local development

### Frontend only (default, no backend)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — the in-browser demo engine works with zero
setup. To test against a local backend instead, start it (below) and enter
`http://127.0.0.1:8000` in the ⚙ settings panel.

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # optional, defaults to the mock engine
uvicorn app.main:app --reload --port 8000
```

## Docker Compose (backend + a served frontend build)

```bash
docker compose up --build
```

Frontend: http://localhost:8080, backend: http://localhost:8000. The
frontend still defaults to the in-browser demo engine — open it, click ⚙,
and set the backend URL to `http://localhost:8080` (the frontend's own
origin; nginx proxies `/api/*` to the backend container per
`frontend/nginx.conf`, so no CORS configuration is needed) to route
separation through the compose backend instead. Set
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

- Audio I/O on the backend uses `soundfile` rather than `torchaudio.load/save`,
  since newer torchaudio versions require TorchCodec + a matching system
  FFmpeg install; `soundfile` covers wav/flac/ogg with no extra system
  dependencies.
- SAM-Audio itself is distributed under Meta's SAM License — see the
  [upstream repo](https://github.com/facebookresearch/sam-audio) for terms
  before using its checkpoints.
