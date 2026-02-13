# Frontend (React + Vite)

This is the UI for the AI Interview Simulator.

## Run locally

From the `frontend/` directory:

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

Open: `http://localhost:4173`

## Build

```bash
npm run build
```

## Notes

- The frontend expects backend APIs at:
  - `POST http://localhost:5000/generate`
  - `POST http://localhost:5000/score`
- Make sure backend is running before generating/scoring.
