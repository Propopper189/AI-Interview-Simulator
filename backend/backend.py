from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import io
import json
import os
import re
import uuid
from urllib import error, request as urllib_request

app = Flask(__name__)
CORS(app)


class NvidiaAPIError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


class AIInterviewSimulator:
    def __init__(self):
        self.model = os.getenv("NVIDIA_MODEL", "meta/llama-3.1-8b-instruct")
        self.base_url = "https://integrate.api.nvidia.com/v1"

    def _generate_text(self, prompt):
        api_key = os.getenv("NVIDIA_API_KEY")
        if not api_key:
            raise RuntimeError(
                "NVIDIA_API_KEY is missing. Set it in the same terminal before running backend.py."
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
        api_key = os.getenv("NVIDIA_API_KEY")
        if not api_key:
            raise RuntimeError(
                "NVIDIA_API_KEY is missing. Set it in the same terminal before running backend.py."
            )

        stt_model = os.getenv("NVIDIA_STT_MODEL", "openai/whisper-large-v3")
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
                payload = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as http_error:
            try:
                details = json.loads(http_error.read().decode("utf-8"))
                message = details.get("detail") or details.get("message") or str(details)
            except Exception:
                message = http_error.reason
            raise NvidiaAPIError(http_error.code, message) from None
        except error.URLError as url_error:
            raise NvidiaAPIError(503, f"Network error while contacting NVIDIA API: {url_error.reason}") from None

        return (payload.get("text") or "").strip()

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

    try:
        transcript = simulator.transcribe_audio(
            audio_bytes=audio_file.read(),
            filename=audio_file.filename or "audio.webm",
            mime_type=audio_file.mimetype or "audio/webm",
        )
        return jsonify({"text": transcript})
    except Exception as err:
        return ai_error_response(err)


if __name__ == "__main__":
    app.run(port=5000, debug=True)
