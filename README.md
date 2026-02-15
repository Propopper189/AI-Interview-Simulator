# AI Interview Simulator

A simple interview practice app with:
- **Frontend**: React + Vite UI for login, question generation, and answer scoring.
- **Backend**: Flask API using NVIDIA NIM to generate and evaluate interview answers.

### Request/Response Flow (Desktop + API)

```text
Electron (UI - Desktop App)
        ↓ HTTP (localhost)
Flask Backend (Python API Layer)
        ↓ HTTPS
NVIDIA Whisper API (Speech → Text)
        ↓
LLM (Interview Brain)
        ↓
Flask returns response
        ↓
Electron displays AI question
```

---

## 1) Project Structure

```text
AI_INTERVIEW_SIMULATOR/
├── backend/
│   ├── backend.py
│   └── package.json          # legacy (backend runtime is Python)
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── requirements.txt
└── README.md
```

---

## 2) Prerequisites

Install:
- Python 3.10+
- Node.js 18+ and npm
- NVIDIA API key (questions + scoring)
- NVIDIA STT API key (Whisper transcription)

Check versions:

```bash
python --version
node --version
npm --version
```

---

## 3) Install From Scratch

### Step A — Clone

```bash
git clone https://github.com/Propopper189/AI-Interview-Simulator
cd AI_INTERVIEW_SIMULATOR
```

### Step B — Backend setup

```bash
python -m venv .venv
source .venv/bin/activate              # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
```

Set env vars:

This project uses **NVIDIA API** for questions/scoring and **NVIDIA Whisper** for speech-to-text (can use a separate STT key).

#### macOS/Linux
```bash
export NVIDIA_API_KEY="your_nvidia_api_key_here"
export NVIDIA_MODEL="meta/llama-3.1-8b-instruct"   # optional
export NVIDIA_STT_API_KEY="your_nvidia_whisper_key_here" # optional: dedicated key for Whisper STT
export NVIDIA_STT_MODEL="openai/whisper-large-v3"        # speech-to-text model
```

Whisper key source:
- Generate/access the Whisper-capable key from: `https://build.nvidia.com/openai/whisper-large-v3`
- Use that key as `NVIDIA_STT_API_KEY` (or `NVIDIA_API_KEY` if sharing one key)

#### Windows PowerShell
```powershell
$env:NVIDIA_API_KEY="your_nvidia_api_key_here"
$env:NVIDIA_MODEL="meta/llama-3.1-8b-instruct"     # optional
$env:NVIDIA_STT_API_KEY="your_nvidia_whisper_key_here"  # optional: dedicated key for Whisper STT
$env:NVIDIA_STT_MODEL="openai/whisper-large-v3"          # speech-to-text model
```

Run backend:

```bash
python backend/backend.py
```

Backend URL: `http://localhost:5000`

### Step C — Frontend setup

Open a second terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

Frontend URL: `http://localhost:4173`

---


## 3D) Run as a Full Desktop App (No Browser Required)

You can run the simulator as a desktop app (Electron) so users do not need to open a browser manually.

```bash
cd desktop
npm install
```

### Desktop production-like run (recommended)
Builds frontend and opens the app window:

```bash
cd desktop
npm run start:desktop
```

### Desktop development run
Keeps browser option for web developers while still supporting the desktop shell:

1. Start frontend dev server in one terminal:
   ```bash
   cd frontend
   npm install
   npm run dev -- --host 0.0.0.0 --port 4173
   ```
2. Start desktop shell in another terminal:
   ```bash
   cd desktop
   npm run start:desktop:dev
   ```

The desktop app will auto-start the Python backend and wait until it is reachable before loading UI.

### Windows Installer (full app with one-click icon launch)

The Windows installer now installs the packaged desktop app (Electron), so users can launch from the Start menu/Desktop icon without opening a browser manually.

Installer flow:
1. Installer asks for **two required keys**: `NVIDIA_API_KEY` (questions/scoring) and `NVIDIA_STT_API_KEY` (Whisper).
2. Installer runs in **mandatory admin mode** (non-admin install is blocked).
3. Installer validates both keys against NVIDIA API before allowing next step.
4. Installer stores both keys as machine environment variables: `NVIDIA_API_KEY` and `NVIDIA_STT_API_KEY`.
5. After install, launch **AI Interview Simulator** from the app icon.

To build this installer:
```powershell
cd windows
./build_windows_installer.ps1
```

> Note: the build script now stages desktop files into `.installer_payload/app-unpacked` automatically.
> `windows_installer.iss` now uses an absolute script-root path (`{#SourcePath}`) for installer sources, fixing line-16 path resolution issues when ISCC is run from different working directories.

### Step-by-step Windows installation (end users)

Use these exact steps if you want the full app experience (no manual browser opening):

1. Download `AIInterviewSimulatorInstaller.exe`.
2. Right-click installer and choose **Run as administrator**.
3. On **NVIDIA API Key Configuration** page, paste both keys:
   - `NVIDIA_API_KEY` (questions/scoring)
   - `NVIDIA_STT_API_KEY` (Whisper)
4. Click **Next** only after both key validations succeed.
5. Complete installation.
6. Launch from Desktop icon **AI Interview Simulator** (or Start Menu).
7. Login with demo credentials (`aquib` / `1234`) and start using the app.

If validation fails, recheck both keys and internet connectivity, then retry before proceeding.

## 4) Demo Login

Use:
- **Username:** `aquib`
- **Password:** `1234`

---

## 5) API Endpoints

### `POST /generate`

Request:

```json
{
  "job_role": "Software Engineer",
  "job_description": "Build APIs and frontend features"
}
```

Response:

```json
{
  "questions": ["1. ...", "2. ..."]
}
```

### `POST /score`

Request:

```json
{
  "question": "Explain OOP",
  "answer": "Object-oriented programming is..."
}
```

Response:

```json
{
  "score": 8,
  "feedback": ["Good explanation"],
  "improvements": ["Add a practical example"]
}
```

### `POST /transcribe-audio`

Request: multipart form-data
- `audio`: wav/webm audio file captured from browser mic

Response:

```json
{
  "text": "recognized speech"
}
```

Notes:
- Backend uses `NVIDIA_STT_API_KEY` for transcription when present (falls back to `NVIDIA_API_KEY`).
- Backend first tries `NVIDIA_STT_MODEL` (default: `openai/whisper-large-v3`).
- If that model is unavailable/inaccessible for the API key (for example 400/403/404 model errors), backend returns a warning and may use local WAV-only fallback when available.

### `POST /realtime-score`

Request:

```json
{
  "role": "Frontend Developer",
  "transcript": "Interviewer Question... Candidate Response...",
  "session_seconds": 45,
  "eye_contact": 60,
  "posture": 70,
  "outfit": 75,
  "filler_words": 4,
  "frame_base64": "data:image/jpeg;base64,..."
}
```

Response includes score fields and may include visual estimates when frame analysis is applied.

---

## 6) Troubleshooting

### A) Frontend shows blank page / login not visible

1. Confirm frontend server is running:
   ```bash
   cd frontend
   npm run dev -- --host 0.0.0.0 --port 4173
   ```
2. Open the exact URL: `http://localhost:4173`
3. Check browser console for runtime errors.
4. Reinstall frontend deps if needed:
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   npm run dev -- --host 0.0.0.0 --port 4173
   ```

### B) Generate/Score buttons fail

- Make sure backend is running at `http://localhost:5000`.
- Verify `NVIDIA_API_KEY` is set in the **same terminal session** where backend is started.

### C) NVIDIA authentication errors (401)

- Re-check key value and format.
- Re-export env vars and restart backend.

### D) CORS issues

- Backend already enables CORS via `flask_cors.CORS(app)`.
- Ensure you are calling backend on `http://localhost:5000`.

---

## 7) Build for Production

```bash
cd frontend
npm run build
```

---

Project owner in UI: **Aquib Jawaid Ansari**.



### Real Time speech-segment pipeline

Real Time mode now tracks when the candidate is speaking (voice activity detection via browser audio RMS).
When speech stops for a short silence window, the app automatically:
1. Sends the captured audio segment to `/transcribe-audio`
2. Captures a current video frame
3. Calls `/realtime-score` with updated transcript + vision/audio metrics

This gives closer-to-live per-answer coaching updates instead of only fixed interval polling.

#### Quick setup steps if transcription is empty
1. Save your NVIDIA key in **⚙ Settings** inside the app (or set `NVIDIA_API_KEY` before starting backend) for questions/scoring.
2. Set `NVIDIA_STT_API_KEY` if Whisper should use a separate NVIDIA key.
3. Restart backend after changing env vars so STT configuration is reloaded.
4. Set `NVIDIA_STT_MODEL=openai/whisper-large-v3` for speech-to-text, then speak for 3–5 seconds and pause briefly to verify transcript output.
5. If you still see model/key warnings, regenerate/check your key at `https://build.nvidia.com/openai/whisper-large-v3` and set it as `NVIDIA_STT_API_KEY`.

## 8) Build Windows .exe Installer

You can generate a Windows installer (`.exe`) that packages:
- Backend as a standalone executable (`AIInterviewBackend.exe`) via PyInstaller
- Frontend production build (`frontend/dist`)
- A launcher batch file
- Inno Setup installer (`AIInterviewSimulatorInstaller.exe`)

### Steps on a Windows machine

1. Install prerequisites:
   - Python 3.10+
   - Node.js 18+
   - Inno Setup 6

2. From repository root, run PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File windows\build_windows_installer.ps1
```

3. After successful build:
   - Backend exe: `dist\AIInterviewBackend.exe`
   - Installer exe output: generated by Inno Setup (Output directory)

The installer script is: `windows_installer.iss`.

During installation, the wizard requires admin rights, asks for both NVIDIA keys, validates them, and stores them as machine environment variables (`NVIDIA_API_KEY`, `NVIDIA_STT_API_KEY`).

You can later update/change the API key from the app UI: **Settings** button in the top header.


## 9) Build Windows 11 Desktop App (Electron, free)

You can build a native Windows 11 desktop installer using Electron + electron-builder.

```powershell
powershell -ExecutionPolicy Bypass -File windows\build_windows11_app.ps1
```

Output installer: `desktop\dist` (NSIS-based Windows installer).

