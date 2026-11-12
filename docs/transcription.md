# Voice Transcription

`telegram_transcribe_voice` turns voice messages, round video notes, audio files and videos into text. It has two backends; configure one (or both) in `.env`.

| Backend | Runs on | Cost | Needs |
| --- | --- | --- | --- |
| `local` | your machine, offline | free | `whisper-cli` (whisper.cpp), `ffmpeg`, a ggml model file |
| `openai` | any OpenAI-compatible API | per minute of audio | `OPENAI_API_KEY` |

If both are configured, `local` is used unless `TELEGRAM_MCP_TRANSCRIBE_BACKEND=openai`.

Nothing runs in the background: for each request the server spawns `ffmpeg` and `whisper-cli`, which exit when done, so idle CPU/RAM use is zero. Messages in one call are transcribed one at a time.

## Local (whisper.cpp)

### 1. Install whisper.cpp and ffmpeg

- **macOS:** `brew install whisper-cpp ffmpeg`
- **Linux:** `sudo apt install ffmpeg` (or your distro's package), then build whisper.cpp:
  ```bash
  git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp
  cmake -B build && cmake --build build -j --config Release
  # binary: build/bin/whisper-cli
  ```
- **Windows:** `winget install Gyan.FFmpeg`, then download a prebuilt `whisper-bin-x64.zip` from the [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases) and unzip it anywhere.

If a binary is not on `PATH`, point to it: `WHISPER_CPP_BIN=C:\tools\whisper\whisper-cli.exe`, `FFMPEG_BIN=...`.

### 2. Download a model

[large-v3-turbo](https://huggingface.co/ggerganov/whisper.cpp) is the recommended model: close to large-v3 quality, several times faster, good with Russian, Ukrainian and English. The quantized `q5_0` file is 547 MB and needs about 1 GB of RAM while running.

```bash
mkdir -p .local/models
curl -L -o .local/models/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
```

On Windows PowerShell use `Invoke-WebRequest -Uri <url> -OutFile .local\models\ggml-large-v3-turbo-q5_0.bin`.

For weak machines, `ggml-small-q5_1.bin` (190 MB) is a lighter fallback with lower accuracy.

### 3. Configure

```env
WHISPER_MODEL_PATH=.local/models/ggml-large-v3-turbo-q5_0.bin
# optional
WHISPER_THREADS=4
TELEGRAM_MCP_TRANSCRIBE_LANGUAGE=auto
```

Relative paths resolve against the package root. Speed reference: a 2-minute voice note takes about 20 s on an Apple M-series laptop (Metal). Expect it to be slower on CPU-only machines; whisper.cpp uses CUDA/Vulkan builds on Windows/Linux if you install one.

## OpenAI-compatible API

```env
OPENAI_API_KEY=sk-...
# optional
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

Any service that implements `POST /audio/transcriptions` works. For example, Groq hosts Whisper large-v3-turbo and has a free tier:

```env
OPENAI_API_KEY=gsk_...
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_TRANSCRIBE_MODEL=whisper-large-v3-turbo
```

Audio is uploaded as-is (Telegram's OGG/Opus or MP4), so `ffmpeg` is not needed for this backend. Uploads are limited to 25 MB.

A ChatGPT Plus/Pro subscription does not include API access: the API needs a key from platform.openai.com, billed separately.

## Privacy

The `local` backend keeps audio on your machine; temporary files are deleted after each request. The `openai` backend sends the audio to the configured provider.
