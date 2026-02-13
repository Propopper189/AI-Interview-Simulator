import { useEffect, useMemo, useState } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";

const DEMO_USER = "aquib";
const DEMO_PASS = "1234";

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [jobRole, setJobRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isScoring, setIsScoring] = useState(false);

  const progress = useMemo(() => {
    if (!questions.length) return 0;
    return Math.round((Object.keys(results).length / questions.length) * 100);
  }, [questions.length, results]);

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

  const handleLogin = (event) => {
    event.preventDefault();
    if (username.trim().toLowerCase() === DEMO_USER && password === DEMO_PASS) {
      setIsLoggedIn(true);
      return;
    }
    alert("Invalid credentials. Demo login: aquib / 1234");
  };

  const handleGenerate = async () => {
    if (!jobRole || !jobDescription) return alert("Enter both role and description");

    try {
      setIsGenerating(true);
      const res = await fetch("http://localhost:5000/generate", {
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

  const handleScore = async () => {
    const answer = answers[currentIndex];
    if (!answer) return alert("Please type an answer");

    try {
      setIsScoring(true);
      const question = questions[currentIndex].replace(/^\d+\.\s*/, "");
      const res = await fetch("http://localhost:5000/score", {
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
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-3 py-6 text-slate-100 md:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-8 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-none flex-col gap-6">
        <header className="glass-panel rounded-3xl border border-cyan-300/30 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Neural Practice Deck</p>
              <h1 className="text-3xl font-bold md:text-4xl">
                AI Interview <span className="text-fuchsia-300">Simulator</span>
              </h1>
            </div>
            <img src={reactLogo} alt="Neuron core" className="login-logo" />
          </div>
        </header>

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
      </div>
    </main>
  );
}

export default App;
