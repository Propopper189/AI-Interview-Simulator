# AI Interview Simulator

A simple interview practice app with:
- **Frontend**: React + Vite UI for login, question generation, and answer scoring.
- **Backend**: Flask API using NVIDIA NIM to generate and evaluate interview answers.

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
- NVIDIA API key

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
git clone https://github.com/Propopper189/AI_INTERVIEW_SIMULATOR.git](https://github.com/Propopper189/AI-Interview-Simulator
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

This project uses **NVIDIA APIs only** for LLM and STT paths.

#### macOS/Linux
```bash
export NVIDIA_API_KEY="your_nvidia_api_key_here"
export NVIDIA_MODEL="meta/llama-3.1-8b-instruct"   # optional
```

#### Windows PowerShell
```powershell
$env:NVIDIA_API_KEY="your_nvidia_api_key_here"
$env:NVIDIA_MODEL="meta/llama-3.1-8b-instruct"     # optional
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
