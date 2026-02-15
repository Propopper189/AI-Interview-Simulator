from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import json
import os
import re
import sys
import uuid
import tempfile
import wave
from urllib import error, request as urllib_request

try:
    import speech_recognition as sr
except Exception:
    sr = None



app = Flask(__name__)
CORS(app)

APP_ROOT = os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.getenv("NVIDIA_SETTINGS_FILE", os.path.join(APP_ROOT, "nvidia_settings.json"))


def load_saved_api_key():
    try:
        if not os.path.exists(SETTINGS_FILE):
            return None
        with open(SETTINGS_FILE, "r", encoding="utf-8") as file_obj:
            payload = json.load(file_obj)
        key = (payload.get("nvidia_api_key") or "").strip()
        return key or None
    except Exception:
        return None


def save_api_key(api_key):
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as file_obj:
        json.dump({"nvidia_api_key": api_key.strip()}, file_obj)


def mask_api_key(api_key):
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:4]}{'*' * (len(api_key) - 8)}{api_key[-4:]}"


def get_effective_api_key():
    return (os.getenv("NVIDIA_API_KEY") or "").strip() or load_saved_api_key()


def get_effective_stt_api_key():
    return (os.getenv("NVIDIA_STT_API_KEY") or "").strip() or get_effective_api_key()


def transcribe_with_speech_recognition(audio_bytes, mime_type="audio/webm"):
    if sr is None:
        raise RuntimeError("SpeechRecognition package is not installed.")

    mime = (mime_type or "").lower()
    if not any(token in mime for token in ["wav", "x-wav", "wave"]):
        raise RuntimeError("SpeechRecognition fallback supports WAV input only.")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
        temp_wav.write(audio_bytes)
        temp_path = temp_wav.name

    try:
        # Validate WAV header quickly to avoid cryptic recognizer errors.
        with wave.open(temp_path, "rb") as _:
            pass

        recognizer = sr.Recognizer()
        with sr.AudioFile(temp_path) as source:
            audio_data = recognizer.record(source)

        return (recognizer.recognize_google(audio_data) or "").strip()
    except sr.UnknownValueError:
        return ""
    except sr.RequestError as req_err:
        raise RuntimeError(f"SpeechRecognition service error: {req_err}")
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


class NvidiaAPIError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


class AIInterviewSimulator:
    def __init__(self):
        self.model = os.getenv("NVIDIA_MODEL", "meta/llama-3.1-8b-instruct")
        self.base_url = "https://integrate.api.nvidia.com/v1"

    def _generate_text(self, prompt):
        api_key = get_effective_api_key()
        if not api_key:
            raise RuntimeError(
                "NVIDIA_API_KEY is missing. Set it via environment variable or /settings/api-key endpoint."
            )

        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.5,
        }

        req = urllib_request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib_request.urlopen(req, timeout=60) as response:
                body = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as http_error:
            try:
                details = json.loads(http_error.read().decode("utf-8"))
                message = details.get("detail") or details.get("message") or str(details)
            except Exception:
                message = http_error.reason
            raise NvidiaAPIError(http_error.code, message) from None
        except error.URLError as url_error:
            raise NvidiaAPIError(503, f"Network error while contacting NVIDIA API: {url_error.reason}") from None

        return body.get("choices", [{}])[0].get("message", {}).get("content", "")

    def transcribe_audio(self, audio_bytes, filename="audio.webm", mime_type="audio/webm"):
        api_key = get_effective_stt_api_key()
        if not api_key:
            raise RuntimeError(
                "NVIDIA_STT_API_KEY is missing. Set it (or NVIDIA_API_KEY) via environment variable or /settings/api-key endpoint."
            )

        stt_model = os.getenv("NVIDIA_STT_MODEL", "openai/whisper-large-v3")
        payload = self._transcribe_audio_with_model(
            api_key=api_key,
            stt_model=stt_model,
            audio_bytes=audio_bytes,
            filename=filename,
            mime_type=mime_type,
        )
        return (payload.get("text") or "").strip()

    def _transcribe_audio_with_model(self, api_key, stt_model, audio_bytes, filename="audio.webm", mime_type="audio/webm"):
        boundary = f"----NVAudioBoundary{uuid.uuid4().hex}"

        parts = []
        parts.append(f"--{boundary}\r\n".encode("utf-8"))
        parts.append(f'Content-Disposition: form-data; name="model"\r\n\r\n{stt_model}\r\n'.encode("utf-8"))
        parts.append(f"--{boundary}\r\n".encode("utf-8"))
        parts.append(
            (
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: {mime_type or 'audio/webm'}\r\n\r\n"
            ).encode("utf-8")
        )
        parts.append(audio_bytes)
        parts.append("\r\n".encode("utf-8"))
        parts.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(parts)

        req = urllib_request.Request(
            f"{self.base_url}/audio/transcriptions",
            data=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )

        try:
            with urllib_request.urlopen(req, timeout=120) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as http_error:
            try:
                details = json.loads(http_error.read().decode("utf-8"))
                message = details.get("detail") or details.get("message") or str(details)
            except Exception:
                message = http_error.reason
            raise NvidiaAPIError(http_error.code, message) from None
        except error.URLError as url_error:
            raise NvidiaAPIError(503, f"Network error while contacting NVIDIA API: {url_error.reason}") from None

    @staticmethod
    def _clamp_score(value):
        return max(1, min(10, int(round(value))))

    @staticmethod
    def _count_words(text):
        return len(re.findall(r"\b\w+\b", text or ""))

    def _estimate_visual_scores(self, frame_base64):
        default_scores = {"eye_contact": 6, "posture": 6, "outfit": 6}
        if not frame_base64:
            return default_scores

        try:
            encoded = frame_base64.split(",", 1)[1] if "," in frame_base64 else frame_base64
            image_bytes = base64.b64decode(encoded)
            sample = image_bytes[:5000] if image_bytes else b""
            intensity = (sum(sample) / max(len(sample), 1)) if sample else 120
            size_hint = len(image_bytes) / 1024

            eye_contact = self._clamp_score((size_hint / 16) + 4)
            posture = self._clamp_score((intensity / 35) + 3)
            outfit = self._clamp_score(((size_hint + intensity) / 45) + 2)
            return {"eye_contact": eye_contact, "posture": posture, "outfit": outfit}
        except Exception:
            return default_scores

    def _heuristic_realtime_score(self, transcript, session_seconds, filler_words, visual_scores, confidence_signal=6, lighting_score=6, face_detected=None):
        words = self._count_words(transcript)
        wpm = (words / max(session_seconds, 1)) * 60
        filler_density = filler_words / max(words, 1)

        tone = self._clamp_score(8.2 - (filler_density * 30) - abs(135 - wpm) / 40)
        confidence = self._clamp_score(4 + min(words / 35, 3) - (filler_density * 24) + (confidence_signal - 6) * 0.55)
        posture = visual_scores.get("posture", 6)
        outfit = visual_scores.get("outfit", 6)

        overall = self._clamp_score((tone + confidence + posture + outfit + visual_scores.get("eye_contact", 6)) / 5)

        face_state = "detected" if face_detected is True else ("not detected" if face_detected is False else "not confirmed")
        light_state = "good" if lighting_score >= 7 else ("moderate" if lighting_score >= 4 else "poor")

        return {
            "overall_score": overall,
            "tone_score": tone,
            "posture_score": posture,
            "outfit_score": outfit,
            "confidence_score": confidence,
            "summary": "Heuristic realtime assessment generated from speech patterns and visual cues.",
            "feedback": [
                f"Speech pace is about {int(wpm)} words per minute.",
                f"Detected filler usage is {round(filler_density * 100, 1)}% of spoken words.",
                f"Face detection is {face_state}; lighting quality is {light_state}.",
            ],
            "improvements": [
                "Pause briefly before key points to sound more composed.",
                "Keep shoulders straight and maintain camera-facing posture.",
                "Improve front lighting and keep your face centered for stable tracking.",
            ],
        }

    def realtime_score(self, role, job_description, transcript, session_seconds, filler_words, frame_base64, eye_contact=None, posture=None, outfit=None, confidence_signal=6, lighting_score=6, face_detected=None):
        visual_scores = self._estimate_visual_scores(frame_base64)
        if eye_contact is not None:
            visual_scores["eye_contact"] = self._clamp_score(eye_contact)
        if posture is not None:
            visual_scores["posture"] = self._clamp_score(posture)
        if outfit is not None:
            visual_scores["outfit"] = self._clamp_score(outfit)

        heuristic = self._heuristic_realtime_score(
            transcript=transcript,
            session_seconds=session_seconds,
            filler_words=filler_words,
            visual_scores=visual_scores,
            confidence_signal=self._clamp_score(confidence_signal),
            lighting_score=self._clamp_score(lighting_score),
            face_detected=face_detected,
        )

        if not get_effective_api_key():
            return heuristic

        prompt = f"""
You are a realtime interview coach evaluating a candidate.

Role: {role}
Job Description: {job_description}

Candidate transcript:
{transcript}

Observed metrics:
- Session seconds: {session_seconds}
- Filler words: {filler_words}
- Eye contact estimate: {visual_scores['eye_contact']}/10
- Posture estimate: {visual_scores['posture']}/10
- Outfit estimate: {visual_scores['outfit']}/10
- Lighting estimate: {lighting_score}/10
- Face detected: {face_detected}

Return ONLY valid JSON in this schema:
{{
  "overall_score": 1-10 integer,
  "tone_score": 1-10 integer,
  "posture_score": 1-10 integer,
  "outfit_score": 1-10 integer,
  "confidence_score": 1-10 integer,
  "summary": "one-line summary",
  "feedback": ["short bullet", "short bullet"],
  "improvements": ["short bullet", "short bullet"]
}}
"""
        raw_output = self._generate_text(prompt)
        match = re.search(r"\{.*\}", raw_output, re.DOTALL)
        if not match:
            return heuristic

        try:
            payload = json.loads(match.group())
            payload["overall_score"] = self._clamp_score(payload.get("overall_score", heuristic["overall_score"]))
            payload["tone_score"] = self._clamp_score(payload.get("tone_score", heuristic["tone_score"]))
            payload["posture_score"] = self._clamp_score(payload.get("posture_score", visual_scores["posture"]))
            payload["outfit_score"] = self._clamp_score(payload.get("outfit_score", visual_scores["outfit"]))
            payload["confidence_score"] = self._clamp_score(payload.get("confidence_score", heuristic["confidence_score"]))
            payload.setdefault("summary", heuristic["summary"])
            payload.setdefault("feedback", heuristic["feedback"])
            payload.setdefault("improvements", heuristic["improvements"])
            return payload
        except Exception:
            return heuristic

    def generate_questions(self, job_role, job_description, n_questions=5):
        prompt = f"""
You are an encouraging interviewer. Generate {n_questions} professional interview questions
for this role.

Job Role: {job_role}
Job Description: {job_description}

Include:
- Technical/functional questions relevant to the role.
- The first question for a software engineer should be a simple coding problem like create a function to print elements of an array.
- If the role is for labour or roles like that ask questions about whether he is ok with the wages, ok to travel and related questions only.
- Behavioral questions about teamwork, leadership, problem-solving, ethics.
- Return as a numbered list only.
"""
        questions_text = self._generate_text(prompt)
        questions = [q.strip() for q in questions_text.split("\n") if q.strip() and q[0].isdigit()]
        return questions[:n_questions]

    def score_answer(self, question, answer):
        prompt = f"""
You are an encouraging interviewer, but also practical and have guts to say that the answer is logicless or anything which will help realize the candidate for its mistake.

Question: {question}
Candidate Answer: {answer}

Evaluate and provide:
- give 0 score for random answers like random characters etc.
- A score from 1 to 10 (real scores)
- Detailed feedback (1-2 bullet points)
- Improvements/tips (1-2 bullet points)
- Even if the answer is not perfect, encourage the candidate by giving it some extra marks.
- Give real and harsh score and suggestions.
- check if the answer is technically related to the question and check if misbehave is detected.

Output ONLY JSON in this format:
{{"score": number, "feedback": ["...", "..."], "improvements": ["...", "..."]}}
"""
        raw_output = self._generate_text(prompt)
        match = re.search(r"\{.*\}", raw_output, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group())
                data["score"] = max(0, min(10, int(data.get("score", 5))))
                data.setdefault("feedback", ["Good effort."])
                data.setdefault("improvements", ["Add clearer examples."])
                return data
            except Exception:
                pass

        return {
            "score": 5,
            "feedback": ["AI output could not be parsed."],
            "improvements": ["Keep trying! Answer more clearly and provide examples."],
        }


simulator = AIInterviewSimulator()


def safe_int(value, default=None):
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def is_nvidia_not_found_error(err):
    if not isinstance(err, NvidiaAPIError):
        return False
    message = str(err).lower()
    return err.status_code == 404 or "not found" in message


def is_nvidia_stt_model_unavailable_error(err):
    if not isinstance(err, NvidiaAPIError):
        return False

    message = str(err).lower()
    unavailable_markers = [
        "not found",
        "model not found",
        "does not exist",
        "unavailable",
        "not available",
        "no access",
        "access denied",
        "not enabled",
    ]
    return err.status_code in {400, 403, 404} and any(marker in message for marker in unavailable_markers)


def ai_error_response(err):
    if isinstance(err, RuntimeError):
        return jsonify({"error": str(err)}), 400

    if isinstance(err, NvidiaAPIError):
        if err.status_code == 401:
            return (
                jsonify(
                    {
                        "error": "NVIDIA authentication failed. Verify NVIDIA_API_KEY and regenerate if needed.",
                    }
                ),
                401,
            )
        return jsonify({"error": f"NVIDIA API error: {err}"}), err.status_code

    return jsonify({"error": "Unexpected backend error."}), 500



@app.route("/settings/api-key", methods=["GET", "POST"])
def api_key_settings():
    if request.method == "GET":
        env_key = (os.getenv("NVIDIA_API_KEY") or "").strip()
        saved_key = load_saved_api_key()
        active_key = env_key or saved_key
        return jsonify(
            {
                "configured": bool(active_key),
                "source": "environment" if env_key else ("saved" if saved_key else "none"),
                "masked_key": mask_api_key(active_key or ""),
            }
        )

    data = request.json or {}
    api_key = (data.get("api_key") or "").strip()
    if not api_key:
        return jsonify({"error": "api_key is required."}), 400

    save_api_key(api_key)
    return jsonify({"saved": True, "masked_key": mask_api_key(api_key)})


@app.route("/generate", methods=["POST"])
def generate_questions():
    data = request.json or {}
    job_role = data.get("job_role", "")
    job_description = data.get("job_description", "")

    try:
        questions = simulator.generate_questions(job_role, job_description)
        return jsonify({"questions": questions})
    except Exception as err:
        return ai_error_response(err)


@app.route("/score", methods=["POST"])
def score_answer():
    data = request.json or {}
    question = data.get("question", "")
    answer = data.get("answer", "")

    try:
        result = simulator.score_answer(question, answer)
        return jsonify(result)
    except Exception as err:
        return ai_error_response(err)


@app.route("/transcribe-audio", methods=["POST"])
def transcribe_audio():
    audio_file = request.files.get("audio")
    if audio_file is None:
        return jsonify({"error": "Missing audio file in form-data under key 'audio'."}), 400

    audio_bytes = audio_file.read()
    mime_type = audio_file.mimetype or "audio/webm"
    filename = audio_file.filename or "audio.webm"

    try:
        transcript = simulator.transcribe_audio(
            audio_bytes=audio_bytes,
            filename=filename,
            mime_type=mime_type,
        )
        return jsonify({"text": transcript})
    except Exception as err:
        if isinstance(err, NvidiaAPIError) and err.status_code == 401:
            return jsonify({
                "text": "",
                "warning": "Whisper authentication failed. Generate a key at https://build.nvidia.com/openai/whisper-large-v3 and set NVIDIA_STT_API_KEY (or NVIDIA_API_KEY).",
            })

        if is_nvidia_stt_model_unavailable_error(err):
            # Fallback to SpeechRecognition library (WAV input only) when NVIDIA STT is unavailable.
            try:
                fallback_text = transcribe_with_speech_recognition(
                    audio_bytes=audio_bytes,
                    mime_type=mime_type,
                )
                return jsonify({"text": fallback_text, "warning": "Using SpeechRecognition fallback transcription."})
            except Exception:
                return jsonify({
                    "text": "",
                    "warning": "Speech transcription model not available for this API key. Use a key from https://build.nvidia.com/openai/whisper-large-v3 and set NVIDIA_STT_API_KEY.",
                })
        return ai_error_response(err)


@app.route("/realtime-score", methods=["POST"])
def realtime_score():
    data = request.json or {}

    try:
        role = data.get("role", "Candidate")
        transcript = data.get("transcript", "")
        job_description = data.get("job_description", "")
        session_seconds = max(1, int(data.get("session_seconds", 1)))
        filler_words = max(0, int(data.get("filler_words", 0)))
        frame_base64 = data.get("frame_base64", "")
        eye_contact = safe_int(data.get("eye_contact"), None)
        posture = safe_int(data.get("posture"), None)
        outfit = safe_int(data.get("outfit"), None)
        confidence_signal = safe_int(data.get("confidence_signal"), 6)
        lighting_score = safe_int(data.get("lighting_score"), 6)
        face_detected = data.get("face_detected")
        if isinstance(face_detected, str):
            face_detected = face_detected.lower() in {"1", "true", "yes"}

        result = simulator.realtime_score(
            role=role,
            job_description=job_description,
            transcript=transcript,
            session_seconds=session_seconds,
            filler_words=filler_words,
            frame_base64=frame_base64,
            eye_contact=eye_contact,
            posture=posture,
            outfit=outfit,
            confidence_signal=confidence_signal,
            lighting_score=lighting_score,
            face_detected=face_detected,
        )
        return jsonify(result)
    except Exception as err:
        if is_nvidia_not_found_error(err):
            # Realtime fallback when selected LLM route/model is unavailable.
            heuristic = simulator._heuristic_realtime_score(
                transcript=transcript,
                session_seconds=session_seconds,
                filler_words=filler_words,
                visual_scores=simulator._estimate_visual_scores(frame_base64),
                confidence_signal=confidence_signal,
                lighting_score=lighting_score,
                face_detected=face_detected,
            )
            return jsonify(heuristic)
        return ai_error_response(err)


if __name__ == "__main__":
    app.run(port=5000, debug=True)
