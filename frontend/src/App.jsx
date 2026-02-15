import { useEffect, useMemo, useRef, useState } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";

const DEMO_USER = "aquib";
const DEMO_PASS = "1234";
const BACKEND_URL = "http://localhost:5000";
const FILLER_WORDS = ["um", "uh", "like", "you know", "actually", "basically", "literally"];

const clamp = (value, min = 1, max = 10) => Math.max(min, Math.min(max, value));

const mapRangeToScore = (value, min, max) => {
  if (max <= min) return 6;
  const normalized = (value - min) / (max - min);
  return clamp(Math.round(1 + normalized * 9));
};

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mode, setMode] = useState("standard");

  const [jobRole, setJobRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [realtimeJobDescription, setRealtimeJobDescription] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isScoring, setIsScoring] = useState(false);

  const [isRealtimeRunning, setIsRealtimeRunning] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isEvaluatingRealtime, setIsEvaluatingRealtime] = useState(false);
  const [realtimeReport, setRealtimeReport] = useState(null);
  const [realtimeError, setRealtimeError] = useState("");
  const [speechEngine, setSpeechEngine] = useState("idle");
  const [realtimeQuestions, setRealtimeQuestions] = useState([]);
  const [realtimeQuestionIndex, setRealtimeQuestionIndex] = useState(0);
  const [realtimeAnswerScore, setRealtimeAnswerScore] = useState(null);
  const [isGeneratingRealtimeQuestions, setIsGeneratingRealtimeQuestions] = useState(false);
  const [isScoringRealtimeAnswer, setIsScoringRealtimeAnswer] = useState(false);
  const [visualMetrics, setVisualMetrics] = useState({
    eyeContact: 6,
    posture: 6,
    outfit: 6,
    confidenceSignal: 6,
    lighting: 6,
    faceDetected: false,
    lightingLabel: "Unknown",
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState("Checking API key status...");
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [isApiKeyRequired, setIsApiKeyRequired] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const transcriptionTimerRef = useRef(null);
  const faceDetectorRef = useRef(null);
  const evalTimerRef = useRef(null);
  const frameAnalysisRef = useRef(null);
  const speechMonitorRef = useRef(null);
  const speechStateRef = useRef(false);
  const lastSpeechTsRef = useRef(0);
  const audioChunkBufferRef = useRef([]);
  const isSegmentUploadingRef = useRef(false);
  const startTsRef = useRef(0);
  const transcriptRef = useRef("");
  const realtimeQuestionStartRef = useRef(0);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioDataRef = useRef(null);
  const audioSignalSamplesRef = useRef([]);
  const vadThresholdRef = useRef(0.012);
  const calibrationSamplesRef = useRef([]);

  const progress = useMemo(() => {
    if (!questions.length) return 0;
    return Math.round((Object.keys(results).length / questions.length) * 100);
  }, [questions.length, results]);

  const fillerWordCount = useMemo(() => {
    const normalized = liveTranscript.toLowerCase();
    return FILLER_WORDS.reduce((count, word) => {
      const match = normalized.match(new RegExp(`\\b${word.replace(/\s+/g, "\\\\s+")}\\b`, "g"));
      return count + (match?.length || 0);
    }, 0);
  }, [liveTranscript]);

  useEffect(() => {
    transcriptRef.current = liveTranscript;
  }, [liveTranscript]);

  const speakText = (text) => {
    if (!text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    synth.speak(utter);
  };

  useEffect(() => {
    if (questions.length > 0 && currentIndex < questions.length) {
      const q = questions[currentIndex].replace(/^\d+\.\s*/, "");
      speakText(q);
    }
  }, [currentIndex, questions]);

  useEffect(() => {
    if (mode !== "realtime") return;
    if (realtimeQuestions.length > 0 && realtimeQuestionIndex < realtimeQuestions.length) {
      const q = realtimeQuestions[realtimeQuestionIndex].replace(/^\d+\.\s*/, "");
      speakText(q);
    }
  }, [mode, realtimeQuestionIndex, realtimeQuestions]);

  useEffect(() => () => stopRealtimeSession(), []);

  useEffect(() => {
    if (isLoggedIn) loadApiKeyStatus();
  }, [isLoggedIn]);

  const handleLogin = (event) => {
    event.preventDefault();
    if (username.trim().toLowerCase() === DEMO_USER && password === DEMO_PASS) {
      setIsLoggedIn(true);
      return;
    }
    alert("Invalid credentials. Demo login: aquib / 1234");
  };

  const loadApiKeyStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/settings/api-key`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load API key status.");
      if (!data.configured) {
        setApiKeyStatus("No API key configured yet.");
        setIsApiKeyRequired(true);
        setIsSettingsOpen(true);
      } else {
        setApiKeyStatus(`API key configured (${data.source}): ${data.masked_key}`);
        setIsApiKeyRequired(false);
      }
    } catch {
      setApiKeyStatus("Unable to load API key settings right now.");
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return alert("Enter API key first");

    try {
      setIsSavingApiKey(true);
      const res = await fetch(`${BACKEND_URL}/settings/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save API key.");
      setApiKeyStatus(`API key saved: ${data.masked_key}`);
      setApiKeyInput("");
      setIsApiKeyRequired(false);
    } catch (err) {
      alert(err.message || "Failed to save API key.");
    } finally {
      setIsSavingApiKey(false);
    }
  };

  const handleGenerate = async () => {
    if (!jobRole || !jobDescription) return alert("Enter both role and description");

    try {
      setIsGenerating(true);
      const res = await fetch(`${BACKEND_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_role: jobRole, job_description: jobDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate questions.");
      setQuestions(data.questions || []);
      setAnswers({});
      setResults({});
      setCurrentIndex(0);
    } catch (err) {
      alert(err.message || "Failed to generate questions. Check backend.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateRealtimeQuestions = async () => {
    const role = jobRole.trim();
    const description = (realtimeJobDescription || jobDescription).trim();
    if (!role || !description) {
      setRealtimeError("Enter target role and realtime job description to generate questions.");
      return;
    }

    try {
      setIsGeneratingRealtimeQuestions(true);
      setRealtimeError("");
      const res = await fetch(`${BACKEND_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_role: role, job_description: description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate realtime questions.");
      const generated = data.questions || [];
      setRealtimeQuestions(generated);
      setRealtimeQuestionIndex(0);
      setRealtimeAnswerScore(null);
      realtimeQuestionStartRef.current = transcriptRef.current.length;
    } catch (err) {
      setRealtimeError(err.message || "Failed to generate realtime questions.");
    } finally {
      setIsGeneratingRealtimeQuestions(false);
    }
  };

  const scoreCurrentRealtimeAnswer = async (suppressNoAnswerError = true) => {
    if (!realtimeQuestions.length) return null;

    const currentQuestion = (realtimeQuestions[realtimeQuestionIndex] || "").replace(/^\d+\.\s*/, "").trim();
    if (!currentQuestion) return null;

    const answerText = transcriptRef.current.slice(realtimeQuestionStartRef.current).trim();
    if (!answerText) {
      if (!suppressNoAnswerError) {
        setRealtimeError("No answer transcript captured yet for current realtime question.");
      }
      return null;
    }

    try {
      setIsScoringRealtimeAnswer(true);
      const res = await fetch(`${BACKEND_URL}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: currentQuestion, answer: answerText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to score realtime answer.");
      setRealtimeAnswerScore(data);
      return data;
    } catch (err) {
      setRealtimeError(err.message || "Failed to score realtime answer.");
      return null;
    } finally {
      setIsScoringRealtimeAnswer(false);
    }
  };

  const handleNextRealtimeQuestion = () => {
    if (!realtimeQuestions.length) return;
    setRealtimeAnswerScore(null);
    setRealtimeQuestionIndex((prev) => {
      const next = Math.min(prev + 1, realtimeQuestions.length - 1);
      realtimeQuestionStartRef.current = transcriptRef.current.length;
      return next;
    });
  };

  const handleScore = async () => {
    const answer = answers[currentIndex];
    if (!answer) return alert("Please type an answer");

    try {
      setIsScoring(true);
      const question = questions[currentIndex].replace(/^\d+\.\s*/, "");
      const res = await fetch(`${BACKEND_URL}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to score answer.");

      setResults((prev) => ({ ...prev, [currentIndex]: data }));
      if (currentIndex + 1 < questions.length) setCurrentIndex(currentIndex + 1);
    } catch (err) {
      alert(err.message || "Failed to score answer. Check backend.");
    } finally {
      setIsScoring(false);
    }
  };

  const getAudioRmsLevel = () => {
    if (!analyserRef.current || !audioDataRef.current) return 0;
    analyserRef.current.getByteTimeDomainData(audioDataRef.current);
    return Math.sqrt(
      audioDataRef.current.reduce((sum, v) => {
        const normalized = (v - 128) / 128;
        return sum + normalized * normalized;
      }, 0) / audioDataRef.current.length,
    );
  };

  const getRecorderMimeType = () => {
    if (!window.MediaRecorder?.isTypeSupported) return "";
    const candidates = [
      "audio/wav",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    return candidates.find((type) => window.MediaRecorder.isTypeSupported(type)) || "";
  };

  const sendRealtimeSample = async (audioBlob) => {
    if (!audioBlob || audioBlob.size < 512 || isSegmentUploadingRef.current) return;

    try {
      isSegmentUploadingRef.current = true;
      setRealtimeError("");
      const formData = new FormData();
      const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
      formData.append("audio", audioBlob, `speech-segment.${extension}`);

      const transcribeRes = await fetch(`${BACKEND_URL}/transcribe-audio`, {
        method: "POST",
        body: formData,
      });
      const payload = await transcribeRes.json();
      if (!transcribeRes.ok) {
        throw new Error(payload.error || "Segment transcription unavailable");
      }
      if (payload.warning) {
        setRealtimeError(payload.warning);
      }

      const segmentText = (payload.text || "").trim();
      if (!segmentText) return;

      const nextTranscript = `${transcriptRef.current} ${segmentText}`.trim();
      setLiveTranscript(nextTranscript);
      transcriptRef.current = nextTranscript;

      await evaluateRealtime();
    } catch (err) {
      setRealtimeError(err.message || "Realtime sample processing failed.");
    } finally {
      isSegmentUploadingRef.current = false;
    }
  };

  const analyzeAudioSignal = () => {
    const rms = getAudioRmsLevel();
    if (!rms) return 6;

    const energy = clamp(mapRangeToScore(rms, 0.01, 0.16));
    const samples = audioSignalSamplesRef.current;
    samples.push(energy);
    if (samples.length > 20) samples.shift();

    const avg = samples.reduce((sum, value) => sum + value, 0) / Math.max(samples.length, 1);
    const spread = Math.max(...samples, 0) - Math.min(...samples, 10);
    return clamp(Math.round(avg - spread * 0.2));
  };


  const detectCandidateRegion = (pixels, width, height) => {
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let skinPoints = 0;

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];

        const isSkinTone = r > 80 && g > 45 && b > 30 && r > g && r > b && (r - g) > 12;
        if (!isSkinTone) continue;

        skinPoints += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (skinPoints < 90 || maxX <= minX || maxY <= minY) return null;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      confidence: Math.min(1, skinPoints / ((width * height) / 20)),
    };
  };

  const estimateFrameMetrics = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return visualMetrics;

    const targetWidth = 320;
    const targetHeight = Math.max(180, Math.round((video.videoHeight / video.videoWidth) * targetWidth));
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return visualMetrics;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    let luminanceTotal = 0;
    let contrastTotal = 0;
    for (let i = 0; i < pixels.length; i += 24) {
      const l = (0.2126 * pixels[i]) + (0.7152 * pixels[i + 1]) + (0.0722 * pixels[i + 2]);
      luminanceTotal += l;
      contrastTotal += Math.abs(pixels[i] - pixels[i + 2]);
    }

    const sampleCount = pixels.length / 24;
    const avgLuminance = luminanceTotal / Math.max(sampleCount, 1);
    const avgContrast = contrastTotal / Math.max(sampleCount, 1);

    let eyeContact = 6;
    let posture = 6;
    let faceDetected = false;

    let detectedBox = null;
    if (window.FaceDetector) {
      try {
        if (!faceDetectorRef.current) {
          faceDetectorRef.current = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: true });
        }
        const faces = await faceDetectorRef.current.detect(canvas);
        if (faces.length) {
          detectedBox = faces[0].boundingBox;
        }
      } catch {
        faceDetectorRef.current = null;
      }
    }

    if (!detectedBox) {
      detectedBox = detectCandidateRegion(pixels, canvas.width, canvas.height);
    }

    if (detectedBox) {
      faceDetected = true;
      const centerX = detectedBox.x + detectedBox.width / 2;
      const centerY = detectedBox.y + detectedBox.height / 2;
      const cxNorm = Math.abs((centerX / canvas.width) - 0.5);
      const cyNorm = Math.abs((centerY / canvas.height) - 0.45);
      eyeContact = clamp(10 - Math.round((cxNorm + cyNorm) * 20));

      const sizeRatio = (detectedBox.width * detectedBox.height) / (canvas.width * canvas.height);
      posture = clamp(10 - Math.round(Math.abs(sizeRatio - 0.18) * 70));
    }

    const lighting = mapRangeToScore(avgLuminance, 35, 185);
    const lightingLabel = lighting >= 7 ? "Good" : (lighting >= 4 ? "Moderate" : "Poor");
    const outfit = clamp(Math.round((mapRangeToScore(avgContrast, 8, 60) + lighting) / 2));
    const confidenceSignal = clamp(Math.round((analyzeAudioSignal() + eyeContact + posture) / 3));

    const metrics = { eyeContact, posture, outfit, confidenceSignal, lighting, faceDetected, lightingLabel };
    setVisualMetrics(metrics);
    return metrics;
  };

  const stopRealtimeSession = () => {
    if (evalTimerRef.current) {
      clearInterval(evalTimerRef.current);
      evalTimerRef.current = null;
    }
    if (frameAnalysisRef.current) {
      clearInterval(frameAnalysisRef.current);
      frameAnalysisRef.current = null;
    }
    if (speechMonitorRef.current) {
      clearInterval(speechMonitorRef.current);
      speechMonitorRef.current = null;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      } catch {
        // noop
      }
      mediaRecorderRef.current = null;
    }

    if (transcriptionTimerRef.current) {
      clearInterval(transcriptionTimerRef.current);
      transcriptionTimerRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      analyserRef.current = null;
      audioDataRef.current = null;
      audioSignalSamplesRef.current = [];
      vadThresholdRef.current = 0.012;
      calibrationSamplesRef.current = [];
    }

    if (videoRef.current) videoRef.current.srcObject = null;
    faceDetectorRef.current = null;
    speechStateRef.current = false;
    if (audioChunkBufferRef.current.length) {
      const pendingBlob = new Blob(audioChunkBufferRef.current, { type: "audio/webm" });
      sendRealtimeSample(pendingBlob);
    }
    audioChunkBufferRef.current = [];
    setIsSpeaking(false);
    setSpeechEngine("idle");
    setIsRealtimeRunning(false);
  };

  const evaluateRealtime = async () => {
    if (!videoRef.current || !canvasRef.current || !isRealtimeRunning) return;

    try {
      setIsEvaluatingRealtime(true);
      setRealtimeError("");

      const metrics = await estimateFrameMetrics();
      const canvas = canvasRef.current;
      const frameBase64 = canvas.toDataURL("image/jpeg", 0.7);
      const sessionSeconds = Math.max(1, Math.round((Date.now() - startTsRef.current) / 1000));

      const res = await fetch(`${BACKEND_URL}/realtime-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: jobRole || "Candidate",
          job_description: realtimeJobDescription || jobDescription || "",
          transcript: transcriptRef.current,
          session_seconds: sessionSeconds,
          filler_words: fillerWordCount,
          eye_contact: metrics.eyeContact,
          posture: metrics.posture,
          outfit: metrics.outfit,
          confidence_signal: metrics.confidenceSignal,
          lighting_score: metrics.lighting,
          face_detected: metrics.faceDetected,
          frame_base64: frameBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Realtime evaluation failed.");
      const answerScore = await scoreCurrentRealtimeAnswer(true);
      setRealtimeReport({ ...data, answer_score: answerScore });
    } catch (err) {
      setRealtimeError(err.message || "Realtime evaluation failed.");
    } finally {
      setIsEvaluatingRealtime(false);
    }
  };

  const startRealtimeSession = async () => {
    try {
      setRealtimeError("");
      if (!realtimeQuestions.length) {
        await handleGenerateRealtimeQuestions();
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const context = new AudioCtx();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        audioContextRef.current = context;
        analyserRef.current = analyser;
        audioDataRef.current = new Uint8Array(analyser.fftSize);
      }

      if (window.MediaRecorder) {
        const audioOnlyStream = new MediaStream(stream.getAudioTracks());
        const recorderMimeType = getRecorderMimeType();
        const recorder = recorderMimeType
          ? new MediaRecorder(audioOnlyStream, { mimeType: recorderMimeType })
          : new MediaRecorder(audioOnlyStream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (!event.data || event.data.size < 512) return;
          audioChunkBufferRef.current.push(event.data);
          if (audioChunkBufferRef.current.length > 16) {
            audioChunkBufferRef.current.shift();
          }
        };
        recorder.start(1000);
      } else {
        setRealtimeError("MediaRecorder not available; realtime audio segmentation disabled.");
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event) => {
          let finalText = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            finalText += `${event.results[i][0].transcript} `;
          }
          if (finalText.trim()) {
            setLiveTranscript((prev) => `${prev} ${finalText}`.trim());
          }
        };

        recognition.onerror = () => {
          if (window.MediaRecorder) {
            setSpeechEngine("backend-stt");
          } else {
            setSpeechEngine("none");
          }
        };

        try {
          recognition.start();
          recognitionRef.current = recognition;
          setSpeechEngine(window.MediaRecorder ? "hybrid" : "native");
        } catch {
          if (window.MediaRecorder) {
            setSpeechEngine("backend-stt");
            setRealtimeError("Browser speech recognition unavailable; using backend transcription.");
          } else {
            setSpeechEngine("none");
          }
        }
      } else if (window.MediaRecorder) {
        setSpeechEngine("backend-stt");
        setRealtimeError("SpeechRecognition not supported; using backend transcription.");
      } else {
        setSpeechEngine("none");
      }

      startTsRef.current = Date.now();
      setIsRealtimeRunning(true);

      speechMonitorRef.current = setInterval(() => {
        const rms = getAudioRmsLevel();
        const now = Date.now();

        const calibration = calibrationSamplesRef.current;
        if (now - startTsRef.current < 2200) {
          calibration.push(rms);
          if (calibration.length > 20) calibration.shift();
          const baseline = calibration.reduce((sum, value) => sum + value, 0) / Math.max(calibration.length, 1);
          vadThresholdRef.current = Math.max(0.008, baseline * 2.2);
        }

        const isVoiceActive = rms > vadThresholdRef.current;

        if (isVoiceActive) {
          lastSpeechTsRef.current = now;
          if (!speechStateRef.current) {
            speechStateRef.current = true;
            setIsSpeaking(true);
          }
        } else if (speechStateRef.current && now - lastSpeechTsRef.current > 1200) {
          speechStateRef.current = false;
          setIsSpeaking(false);
          const segmentBlob = new Blob(audioChunkBufferRef.current, { type: "audio/webm" });
          audioChunkBufferRef.current = [];
          sendRealtimeSample(segmentBlob);
        }

        if (!speechStateRef.current && audioChunkBufferRef.current.length >= 4 && !isSegmentUploadingRef.current) {
          const segmentBlob = new Blob(audioChunkBufferRef.current, { type: "audio/webm" });
          audioChunkBufferRef.current = [];
          sendRealtimeSample(segmentBlob);
        }
      }, 250);

      frameAnalysisRef.current = setInterval(() => {
        estimateFrameMetrics();
      }, 2000);
      evalTimerRef.current = setInterval(() => {
        evaluateRealtime();
      }, 12000);
    } catch {
      setRealtimeError("Camera or microphone permission denied.");
    }
  };

  if (!isLoggedIn) {
    return (
      <main className="login-shell">
        <div className="login-card">
          <img src={reactLogo} alt="AI core" className="login-logo" />
          <h1>Neural Access Login</h1>
          <p>Enter credentials to unlock the futuristic interview simulator.</p>
          <form onSubmit={handleLogin} className="login-form">
            <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit">Enter Simulation</button>
          </form>
          <small>Demo: aquib / 1234</small>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-3 pb-6 pt-16 text-slate-100 md:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-8 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-none flex-col gap-6">
        <button
          type="button"
          onClick={() => setIsSettingsOpen((prev) => !prev)}
          className="menu-drawer-button menu-drawer-floating"
          aria-label="Open left menu drawer"
        >
          ☰ Menu
        </button>

        <header className="glass-panel rounded-3xl border border-cyan-300/30 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Neural Practice Deck</p>
              <h1 className="text-3xl font-bold md:text-4xl">
                AI Interview <span className="text-fuchsia-300">Simulator</span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="mode-switch">
                <button type="button" className={mode === "standard" ? "active" : ""} onClick={() => { stopRealtimeSession(); setMode("standard"); }}>Standard</button>
                <button type="button" className={mode === "realtime" ? "active" : ""} onClick={() => setMode("realtime")}>Real Time</button>
              </div>
              <img src={reactLogo} alt="Neuron core" className="login-logo" />
            </div>
          </div>
        </header>

        <div className={`settings-backdrop ${isSettingsOpen ? "open" : ""}`} onClick={() => setIsSettingsOpen(false)} />
        <aside className={`settings-drawer ${isSettingsOpen ? "open" : ""}`}>
          <div className="glass-panel h-full rounded-r-3xl border border-cyan-300/30 p-5 pt-14">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-cyan-200">⚙ Settings</h2>
              <button type="button" onClick={() => setIsSettingsOpen(false)} className="rounded-lg border border-cyan-300/40 px-2 py-1 text-xs text-cyan-100">Close</button>
            </div>
            <div className="mb-4 rounded-xl border border-cyan-300/30 bg-slate-900/50 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Menu</p>
              <p className="mt-1 text-sm font-semibold text-cyan-100">⚙ Settings</p>
            </div>
            <p className="mt-1 text-sm text-cyan-100">Update NVIDIA API key (stored for future launches).</p>
            <p className="mt-2 text-xs text-slate-300">{apiKeyStatus}</p>
            <div className="mt-3 flex flex-col gap-3">
              <input
                type="password"
                placeholder="Enter new NVIDIA API key"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full rounded-xl border border-cyan-300/30 bg-slate-950/80 px-4 py-3"
              />
              <button onClick={handleSaveApiKey} disabled={isSavingApiKey} className="rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">
                {isSavingApiKey ? "Saving..." : "Save API Key"}
              </button>
            </div>
          </div>
        </aside>


        {isApiKeyRequired && (
          <div className="glass-panel rounded-2xl border border-rose-300/40 bg-rose-900/20 p-4 text-sm text-rose-100">
            NVIDIA API key is required before you can use interview generation and scoring. Open <strong>⚙ Settings</strong> and save a valid key.
          </div>
        )}

        {mode === "standard" ? (
          <>
            <section className="glass-panel grid gap-5 rounded-3xl border border-violet-300/20 p-6 md:grid-cols-[1fr,2fr,auto] md:items-end md:p-8">
              <label className="space-y-2">
                <span className="text-sm font-medium text-cyan-100">Job Role</span>
                <input type="text" placeholder="Frontend Developer" value={jobRole} onChange={(e) => setJobRole(e.target.value)} className="h-28 w-full rounded-xl border border-cyan-300/30 bg-slate-950/80 px-4 py-3" />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-cyan-100">Job Description</span>
                <textarea placeholder="Paste the role description here..." value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} className="h-28 w-full rounded-xl border border-cyan-300/30 bg-slate-950/80 px-4 py-3" />
              </label>
              <button onClick={handleGenerate} disabled={isGenerating} className="rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{isGenerating ? "Generating..." : "Generate Questions"}</button>
            </section>

            <section className="glass-panel rounded-2xl border border-cyan-300/30 p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-cyan-100"><span>Session Completion</span><span>{progress}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800/80"><div className="neon-progress h-full bg-gradient-to-r from-cyan-300 via-sky-400 to-fuchsia-400" style={{ width: `${progress}%` }} /></div>
            </section>

            <section className="grid flex-1 content-start gap-5">
              {questions.length === 0 ? (
                <div className="glass-panel rounded-3xl border border-dashed border-cyan-300/25 p-10 text-center">Question stream not initialized.</div>
              ) : (
                questions.map((q, index) => (
                  <article key={index} className={`rounded-3xl border p-6 ${index === currentIndex ? "glass-panel border-cyan-300/45" : "bg-slate-900/60 border-slate-700/80"}`}>
                    <p className="mb-4 text-lg font-semibold text-cyan-200">{q.replace(/^\d+\.\s*/, "")}</p>
                    {index === currentIndex && (
                      <div className="space-y-3">
                        <textarea value={answers[index] || ""} onChange={(e) => setAnswers((prev) => ({ ...prev, [index]: e.target.value }))} className="h-28 w-full rounded-xl border border-cyan-300/30 bg-slate-950/80 px-4 py-3" />
                        <button onClick={handleScore} disabled={isScoring} className="rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{isScoring ? "Scoring..." : "Submit Answer"}</button>
                      </div>
                    )}
                    {results[index] && (
                      <div className="mt-4 rounded-xl border border-slate-700/90 bg-slate-950/80 p-4 text-sm">
                        <p className="font-semibold text-emerald-200">Score: {results[index].score}</p>
                        <p className="mt-2 text-cyan-100">Feedback: {results[index].feedback.join(" | ")}</p>
                        <p className="mt-1 text-cyan-100">Improvements: {results[index].improvements.join(" | ")}</p>
                      </div>
                    )}
                  </article>
                ))
              )}
            </section>
          </>
        ) : (
          <section className="realtime-panel glass-panel grid gap-6 rounded-3xl border border-cyan-300/30 p-6 lg:grid-cols-[1.2fr,1fr]">
            <div className="space-y-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-cyan-100">Target Role</span>
                <input type="text" placeholder="Product Manager" value={jobRole} onChange={(e) => setJobRole(e.target.value)} className="w-full rounded-xl border border-cyan-300/30 bg-slate-950/80 px-4 py-3" />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-cyan-100">Job Description (Real Time)</span>
                <textarea placeholder="Describe responsibilities and required behavior for realtime coaching..." value={realtimeJobDescription} onChange={(e) => setRealtimeJobDescription(e.target.value)} className="h-24 w-full rounded-xl border border-cyan-300/30 bg-slate-950/80 px-4 py-3" />
              </label>
              <div className="rounded-xl border border-cyan-300/30 bg-slate-950/70 p-3 text-sm text-cyan-100">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <button onClick={handleGenerateRealtimeQuestions} disabled={isGeneratingRealtimeQuestions} className="rounded-lg bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60">
                    {isGeneratingRealtimeQuestions ? "Generating..." : "Generate Realtime Questions"}
                  </button>
                  <button onClick={handleNextRealtimeQuestion} disabled={!realtimeQuestions.length || realtimeQuestionIndex >= realtimeQuestions.length - 1} className="rounded-lg border border-cyan-300/40 px-4 py-2 disabled:opacity-50">
                    Next Question
                  </button>
                </div>
                {realtimeQuestions.length ? (
                  <p><strong>Current Question:</strong> {realtimeQuestions[realtimeQuestionIndex]?.replace(/^\d+\.\s*/, "")}</p>
                ) : (
                  <p>No realtime question generated yet.</p>
                )}
              </div>
              <video ref={videoRef} className="camera-view" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex flex-wrap gap-3">
                {!isRealtimeRunning ? (
                  <button onClick={startRealtimeSession} className="rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 font-semibold text-slate-950">Start Realtime Session</button>
                ) : (
                  <button onClick={stopRealtimeSession} className="rounded-xl bg-gradient-to-r from-rose-300 to-orange-300 px-5 py-3 font-semibold text-slate-950">Stop Session</button>
                )}
                <button onClick={evaluateRealtime} disabled={!isRealtimeRunning || isEvaluatingRealtime} className="rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{isEvaluatingRealtime || isScoringRealtimeAnswer ? "Evaluating..." : "Evaluate Now"}</button>
              </div>
              {realtimeError && <p className="text-sm text-rose-300">{realtimeError}</p>}
            </div>

            <div className="space-y-4">
              <p className="text-sm text-cyan-100">Realtime model now blends speech transcript, mic energy, and frame analysis (face centering + lighting + visual consistency).</p>
              <div className="grid grid-cols-2 gap-2 text-sm text-cyan-100">
                <div className="status-chip">Eye Contact: {visualMetrics.eyeContact}/10</div>
                <div className="status-chip">Posture: {visualMetrics.posture}/10</div>
                <div className="status-chip">Outfit: {visualMetrics.outfit}/10</div>
                <div className="status-chip">Confidence Signal: {visualMetrics.confidenceSignal}/10</div>
                <div className="status-chip">Face Detected: {visualMetrics.faceDetected ? "Yes" : "No"}</div>
                <div className="status-chip">Lighting: {visualMetrics.lightingLabel} ({visualMetrics.lighting}/10)</div>
              </div>
              <div className="status-chip text-sm text-cyan-100">Speech engine: <strong>{speechEngine === "backend-stt" ? "backend transcription" : speechEngine}</strong></div>
              <div className="status-chip text-sm text-cyan-100">Currently speaking: <strong>{isSpeaking ? "Yes" : "No"}</strong></div>
              <div className="status-chip text-sm text-cyan-100">Voice threshold: <strong>{vadThresholdRef.current.toFixed(3)}</strong></div>
              <div className="status-chip text-sm text-cyan-100">Filler words detected: <strong>{fillerWordCount}</strong></div>
              <div className="status-chip max-h-40 overflow-auto text-left text-sm text-slate-200">{liveTranscript || "Waiting for speech..."}</div>

              {realtimeReport ? (
                <div className="space-y-3 rounded-xl border border-cyan-300/30 bg-slate-950/80 p-4 text-sm">
                  <h3 className="text-lg font-semibold text-cyan-200">Dynamic AI Evaluation</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="status-chip">Overall: {realtimeReport.overall_score}/10</div>
                    <div className="status-chip">Tone: {realtimeReport.tone_score}/10</div>
                    <div className="status-chip">Posture: {realtimeReport.posture_score}/10</div>
                    <div className="status-chip">Outfit: {realtimeReport.outfit_score}/10</div>
                    <div className="status-chip col-span-2">Confidence: {realtimeReport.confidence_score}/10</div>
                  </div>
                  <p className="text-cyan-100">Summary: {realtimeReport.summary}</p>
                  {realtimeReport.answer_score && (
                    <div className="rounded-lg border border-emerald-300/40 bg-emerald-900/20 p-3 text-emerald-100">
                      <p className="font-semibold">Current Answer Score: {realtimeReport.answer_score.score}</p>
                      <p className="text-sm">Feedback: {realtimeReport.answer_score.feedback?.join(" | ")}</p>
                      <p className="text-sm">Improvements: {realtimeReport.answer_score.improvements?.join(" | ")}</p>
                    </div>
                  )}
                  <ul className="list-disc space-y-1 pl-6 text-cyan-100">
                    {realtimeReport.feedback?.map((item, idx) => <li key={`feedback-${idx}`}>{item}</li>)}
                  </ul>
                  <ul className="list-disc space-y-1 pl-6 text-emerald-200">
                    {realtimeReport.improvements?.map((item, idx) => <li key={`improvement-${idx}`}>{item}</li>)}
                  </ul>
                </div>
              ) : (
                <div className="status-chip text-cyan-100">No realtime report yet. Start session and click Evaluate Now.</div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
