import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import {
  Send,
  Star,
  X,
  Copy,
  Pencil,
  Check,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  Pin,
  Mic,
  Volume2,
} from "lucide-react";
import jsPDF from "jspdf";

// ----------------------
// Utility helpers
// ----------------------
const uid = () => Math.random().toString(36).slice(2);

const THEMES = {
  Dark: {
    app: "bg-gray-900 text-gray-100",
    panel: "bg-gray-950 border-gray-800",
    card: "bg-gray-800 text-gray-100",
    user: "bg-[#facc15] text-gray-900",
    accent: "bg-[#facc15] text-gray-900 hover:bg-yellow-400",
    subtle: "text-gray-400",
  },
  Light: {
    app: "bg-gray-100 text-gray-900",
    panel: "bg-white border-gray-200",
    card: "bg-gray-100 text-gray-900",
    user: "bg-yellow-300 text-gray-900",
    accent: "bg-yellow-400 text-gray-900 hover:bg-yellow-500",
    subtle: "text-gray-500",
  },
  Aurora: {
    app: "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100",
    panel: "bg-slate-950/80 border-slate-800 backdrop-blur",
    card: "bg-slate-800/80 text-slate-100 backdrop-blur",
    user: "bg-emerald-400 text-slate-900",
    accent: "bg-emerald-400 text-slate-900 hover:bg-emerald-300",
    subtle: "text-slate-400",
  },
  Glass: {
    app: "bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.06),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(250,204,21,0.06),transparent_35%)] text-zinc-100",
    panel: "bg-white/10 border-white/20 backdrop-blur-xl",
    card: "bg-white/10 text-zinc-100 backdrop-blur-xl",
    user: "bg-yellow-300/90 text-zinc-900",
    accent: "bg-yellow-300 text-zinc-900 hover:bg-yellow-200",
    subtle: "text-zinc-300",
  },
};

// Suggested follow-ups (simple client-side generator)
function getSuggestions(text) {
  const base = [
    "Summarize that in 3 bullets",
    "Give me an example",
    "What should I do next?",
  ];
  if (!text) return base;
  if (text.length > 240) base.unshift("Shorten that answer");
  if (/code|function|API/i.test(text)) base.unshift("Show a minimal code snippet");
  return base.slice(0, 3);
}

// Text-to-speech helper
const speak = (text) => {
  if (!("speechSynthesis" in window)) return alert("Speech not supported on this browser.");
  const u = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
};

// Speech-to-text helper
function useSpeechInput(onResult) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      onResult(t);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
  }, [onResult]);

  const start = () => {
    if (!recRef.current) return alert("Speech input not supported in this browser.");
    setListening(true);
    recRef.current.start();
  };
  const stop = () => recRef.current?.stop();
  return { start, stop, listening };
}

function App() {
  // ----------------------
  // Core state
  // ----------------------
  const [theme, setTheme] = useState("Dark");
  const T = THEMES[theme];

  const [tone, setTone] = useState("Default");
  const [typingEffect, setTypingEffect] = useState(true);
  const [typingSpeed, setTypingSpeed] = useState(12); // chars per tick

  // Multi-tab sessions
  const [sessions, setSessions] = useState(() => [
    { id: uid(), name: "Chat 1", messages: [] },
  ]);
  const [currentSessionId, setCurrentSessionId] = useState(() => sessions[0]?.id);

  const currentSession = sessions.find((s) => s.id === currentSessionId) || sessions[0];
  const messages = currentSession?.messages || [];

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedChats, setSavedChats] = useState([]);
  const [showSaved, setShowSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(true); // kept for compatibility toggle

  // edit / rename / pins
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [pinnedIds, setPinnedIds] = useState([]);

  const endRef = useRef(null);

  // Smooth scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, currentSessionId]);

  // Load saved chats + draft
  useEffect(() => {
    const stored = localStorage.getItem("savedChats");
    if (stored) setSavedChats(JSON.parse(stored));
    const draft = localStorage.getItem("draftInput");
    if (draft) setInput(draft);
    const storedTheme = localStorage.getItem("appTheme");
    if (storedTheme && THEMES[storedTheme]) setTheme(storedTheme);
  }, []);

  // persist draft
  useEffect(() => {
    localStorage.setItem("draftInput", input);
  }, [input]);

  // ----------------------
  // Session helpers
  // ----------------------
  const updateCurrentSession = (updater) => {
    setSessions((prev) => prev.map((s) => (s.id === currentSessionId ? updater(s) : s)));
  };

  const newTab = () => {
    const id = uid();
    setSessions((prev) => [...prev, { id, name: `Chat ${prev.length + 1}`, messages: [] }]);
    setCurrentSessionId(id);
  };
  const closeTab = (id) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id && sessions.length > 1) {
      const next = sessions.find((s) => s.id !== id);
      setCurrentSessionId(next?.id);
    }
  };

  // ----------------------
  // Saved chats
  // ----------------------
  const saveChat = () => {
    if (messages.length === 0) return;
    const payload = { id: Date.now(), name: currentSession.name, messages };
    const updated = [...savedChats, payload];
    setSavedChats(updated);
    localStorage.setItem("savedChats", JSON.stringify(updated));
  };

  const loadChat = (chat) => {
    // load into current tab
    updateCurrentSession((s) => ({ ...s, name: chat.name, messages: chat.messages }));
    setShowSaved(false);
  };

  const clearAllSaved = () => {
    setSavedChats([]);
    localStorage.removeItem("savedChats");
  };

  const renameChat = (id) => {
    const updated = savedChats.map((c) => (c.id === id ? { ...c, name: renameValue || c.name } : c));
    setSavedChats(updated);
    localStorage.setItem("savedChats", JSON.stringify(updated));
    setRenamingId(null);
    setRenameValue("");
  };

  const exportChatTxt = (chat) => {
    const content = chat.messages.map((m) => `${m.role}: ${m.text}`).join("\n\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chat.name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportChatPdf = (chat) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "");
    doc.setFontSize(12);
    let y = 20;
    doc.text(chat.name, 15, y);
    y += 10;
    chat.messages.forEach((m) => {
      const text = `${m.role.toUpperCase()}: ${m.text}`;
      const split = doc.splitTextToSize(text, 180);
      doc.text(split, 15, y);
      y += split.length * 7 + 4;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });
    doc.save(`${chat.name}.pdf`);
  };

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(savedChats, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-mentor-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importAll = async (file) => {
    const txt = await file.text();
    try {
      const data = JSON.parse(txt);
      if (!Array.isArray(data)) throw new Error("Invalid backup format");
      setSavedChats(data);
      localStorage.setItem("savedChats", JSON.stringify(data));
      alert("Imported chats successfully ✔");
    } catch (e) {
      alert("Failed to import: " + e.message);
    }
  };

  // ----------------------
  // Message actions
  // ----------------------
  const copyMessage = (text) => navigator.clipboard.writeText(text);

  const togglePin = (id) => {
    setPinnedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const startEdit = (msg) => {
    if (msg.role !== "user") return;
    setEditingId(msg.id);
    setEditValue(msg.text);
  };

  const applyEdit = async (msg) => {
    // update the user message text
    updateCurrentSession((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.id === msg.id ? { ...m, text: editValue } : m)),
    }));
    setEditingId(null);

    // re-run AI for the message following this user prompt (if exists) or append new
    const idx = messages.findIndex((m) => m.id === msg.id);
    const nextIsAI = messages[idx + 1]?.role === "ai" ? messages[idx + 1] : null;

    try {
      setLoading(true);
      const promptWithTone = tone === "Default" ? editValue : `[Tone: ${tone}] ${editValue}`;
      const res = await axios.post("http://localhost:5000/api/ask", { prompt: promptWithTone });

      if (nextIsAI) {
        updateCurrentSession((s) => ({
          ...s,
          messages: s.messages.map((m) => (m.id === nextIsAI.id ? { ...m, text: res.data.response } : m)),
        }));
      } else {
        updateCurrentSession((s) => ({
          ...s,
          messages: [...s.messages, { id: uid(), role: "ai", text: res.data.response }],
        }));
      }
    } catch (err) {
      console.error("Edit re-run failed", err);
      setError("Re-run failed. Check backend.");
    } finally {
      setLoading(false);
    }
  };

  // ----------------------
  // AI send + typing effect
  // ----------------------
  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { id: uid(), role: "user", text: input };
    updateCurrentSession((s) => ({ ...s, messages: [...s.messages, userMsg] }));
    setInput("");
    setLoading(true);
    setError("");

    try {
      const promptWithTone = tone === "Default" ? userMsg.text : `[Tone: ${tone}] ${userMsg.text}`;
      const res = await axios.post("http://localhost:5000/api/ask", { prompt: promptWithTone });
      const fullText = res.data.response || "";

      if (!typingEffect) {
        updateCurrentSession((s) => ({ ...s, messages: [...s.messages, { id: uid(), role: "ai", text: fullText }] }));
      } else {
        const aiId = uid();
        let i = 0;
        updateCurrentSession((s) => ({ ...s, messages: [...s.messages, { id: aiId, role: "ai", text: "" }] }));
        const tick = () => {
          i += typingSpeed;
          updateCurrentSession((s) => ({
            ...s,
            messages: s.messages.map((m) => (m.id === aiId ? { ...m, text: fullText.slice(0, i) } : m)),
          }));
          if (i < fullText.length) setTimeout(tick, 25);
        };
        setTimeout(tick, 10);
      }
    } catch (err) {
      console.error("❌ AxiosError:", err);
      setError("Something went wrong. Check your backend server.");
    } finally {
      setLoading(false);
    }
  };

  // ----------------------
  // Summarize Chat
  // ----------------------
  const summarizeChat = async () => {
    if (messages.length === 0) return;
    try {
      setLoading(true);
      const transcript = messages.map((m) => `${m.role}: ${m.text}`).join("\n");
      const res = await axios.post("http://localhost:5000/api/ask", {
        prompt: `Summarize the following conversation in 5 concise bullets.\n\n${transcript}`,
      });
      updateCurrentSession((s) => ({ ...s, messages: [...s.messages, { id: uid(), role: "ai", text: res.data.response }] }));
    } catch (e) {
      setError("Failed to summarize.");
    } finally {
      setLoading(false);
    }
  };

  // ----------------------
  // Render
  // ----------------------
  return (
    <div className={`${T.app} min-h-screen flex font-[Inter]`}>
      {/* Sidebar */}
      <div className={`${sidebarCollapsed ? "w-16" : "w-64"} hidden md:flex flex-col ${T.panel} border-r p-4 transition-all duration-300`}>
        <div className="flex items-center justify-between mb-4">
          <h1 className={`font-bold tracking-wide ${sidebarCollapsed ? "opacity-0 w-0" : "text-xl text-[#facc15]"}`}>AI Mentor</h1>
          <button onClick={() => setSidebarCollapsed((v) => !v)} className="p-2 rounded hover:opacity-80">
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        {!sidebarCollapsed && (
          <>
            <nav className="flex flex-col space-y-2 text-sm">
              <button onClick={newTab} className="text-left px-3 py-2 rounded-lg hover:opacity-90 bg-gray-700/40">➕ New Tab</button>
              <button onClick={() => updateCurrentSession((s)=>({ ...s, messages: [] }))} className="text-left px-3 py-2 rounded-lg hover:opacity-90">💬 New Chat</button>
              <button onClick={() => setShowSaved(true)} className="text-left px-3 py-2 rounded-lg hover:opacity-90">⭐ Saved</button>
              <button onClick={() => setShowSettings(true)} className="text-left px-3 py-2 rounded-lg hover:opacity-90">⚙️ Settings</button>
            </nav>
            <div className="mt-6">
              <p className={`uppercase text-xs ${T.subtle} mb-2`}>Pinned</p>
              <div className="space-y-2 max-h-40 overflow-auto pr-1">
                {messages.filter((m)=>pinnedIds.includes(m.id) && m.role==='ai').map((m)=> (
                  <div key={m.id} className={`px-3 py-2 rounded ${T.card} text-xs line-clamp-3`}>{m.text}</div>
                ))}
                {messages.filter((m)=>pinnedIds.includes(m.id)).length===0 && (
                  <div className={`${T.subtle} text-xs`}>No pins yet.</div>
                )}
              </div>
            </div>
            <div className="mt-auto text-xs opacity-70">© 2025 AI Mentor</div>
          </>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Tabs */}
        <div className={`px-3 py-2 border-b ${T.panel.split(" ")[1]} flex items-center gap-2 overflow-x-auto`}> 
          {sessions.map((s) => (
            <div key={s.id} className={`flex items-center gap-2 px-3 py-1 rounded-full cursor-pointer ${s.id===currentSessionId ? "bg-yellow-400 text-gray-900" : "bg-gray-700/40"}`} onClick={() => setCurrentSessionId(s.id)}>
              <span className="text-sm whitespace-nowrap">{s.name}</span>
              {sessions.length>1 && (
                <button onClick={(e)=>{ e.stopPropagation(); closeTab(s.id); }} className="opacity-80 hover:opacity-100"><X size={14} /></button>
              )}
            </div>
          ))}
        </div>

        {/* Top Bar */}
        <div className={`p-4 border-b ${T.panel.split(" ")[1]} flex items-center justify-between ${T.panel.replace("border-", "")} `}>
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-lg">{currentSession?.name || "Conversation"}</h2>
            <select value={tone} onChange={(e)=>setTone(e.target.value)} className="text-xs px-2 py-1 rounded bg-transparent border border-current">
              {['Default','Formal','Friendly','Teacher','Child-friendly','Sarcastic'].map((t)=>(<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={summarizeChat} className={`text-xs px-3 py-1 rounded-lg ${T.accent}`}>Summarize</button>
            <button onClick={saveChat} className={`text-xs px-3 py-1 rounded-lg ${T.accent}`}>Save Chat</button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, i) => (
            <motion.div key={msg.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl p-4 shadow-lg relative ${msg.role === "user" ? THEMES[theme].user : THEMES[theme].card}`}>
                {editingId === msg.id ? (
                  <div className="space-y-2">
                    <textarea value={editValue} onChange={(e)=>setEditValue(e.target.value)} className="w-full bg-black/10 p-2 rounded" rows={3} />
                    <div className="flex gap-2 justify-end">
                      <button onClick={()=>{setEditingId(null);}} className="px-2 py-1 rounded bg-gray-500/40">Cancel</button>
                      <button onClick={()=>applyEdit(msg)} className={`px-2 py-1 rounded ${T.accent}`}>Apply <Check className="inline" size={14} /></button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    <div className="absolute -bottom-3 right-3 flex gap-2">
                      {msg.role === "ai" ? (
                        <>
                          <button onClick={() => copyMessage(msg.text)} title="Copy" className={`${T.subtle} hover:opacity-100 opacity-80 bg-black/10 px-2 py-1 rounded`}><Copy size={14} /></button>
                          <button onClick={() => speak(msg.text)} title="Speak" className={`${T.subtle} hover:opacity-100 opacity-80 bg-black/10 px-2 py-1 rounded`}><Volume2 size={14} /></button>
                          <button onClick={() => togglePin(msg.id)} title={pinnedIds.includes(msg.id)?"Unpin":"Pin"} className={`${T.subtle} hover:opacity-100 opacity-80 bg-black/10 px-2 py-1 rounded`}>
                            <Pin size={14} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(msg)} title="Edit & Re-run" className={`${T.subtle} hover:opacity-100 opacity-80 bg-black/10 px-2 py-1 rounded`}><Pencil size={14} /></button>
                      )}
                    </div>
                  </>
                )}
                {/* Suggestions under AI */}
                {msg.role === "ai" && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {getSuggestions(msg.text).map((sugg) => (
                      <button key={sugg} onClick={() => setInput(sugg)} className="text-xs px-2 py-1 rounded bg-black/10 hover:bg-black/20">
                        {sugg}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className={`max-w-[70%] ${T.card} p-4 rounded-2xl shadow-lg flex items-center gap-2`}>
                <span className="animate-bounce">💭</span>
                <span className="flex space-x-1">
                  <span className="w-2 h-2 rounded-full animate-pulse bg-current"></span>
                  <span className="w-2 h-2 rounded-full animate-pulse delay-150 bg-current"></span>
                  <span className="w-2 h-2 rounded-full animate-pulse delay-300 bg-current"></span>
                </span>
              </div>
            </motion.div>
          )}
          <div ref={endRef} />
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-500 text-center py-2 bg-red-900/40 border-t border-red-800">{error}</p>
        )}

        {/* Input Row */}
        <div className={`p-4 border-t ${T.panel.split(" ")[1]} ${T.panel.replace("border-", "")}`}>
          <div className="flex items-center gap-3 max-w-4xl mx-auto">
            <motion.input whileFocus={{ scale: 1.02 }} type="text" placeholder="Type your message..." className={`flex-1 p-3 rounded-xl bg-black/20 placeholder-white/40 focus:outline-none focus:ring-2`} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} />

            {/* Mic */}
            <VoiceButton setInput={setInput} />

            <motion.button whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.95 }} onClick={sendMessage} disabled={loading} className={`p-3 rounded-xl font-semibold flex items-center justify-center gap-2 ${loading ? "opacity-60 cursor-not-allowed" : T.accent}`}>
              <Send size={18} />
            </motion.button>
          </div>
          <div className="max-w-4xl mx-auto mt-2 flex items-center gap-3 text-xs opacity-80">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={typingEffect} onChange={(e)=>setTypingEffect(e.target.checked)} />
              Typing effect
            </label>
            {typingEffect && (
              <>
                <span>Speed:</span>
                <input type="range" min={4} max={40} value={typingSpeed} onChange={(e)=>setTypingSpeed(parseInt(e.target.value))} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Saved Chats Panel */}
      {showSaved && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
          <div className={`w-96 ${T.panel} p-4 flex flex-col`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Saved Chats</h3>
              <button onClick={() => setShowSaved(false)}><X /></button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {savedChats.length === 0 && <p className="text-sm opacity-70">No saved chats yet.</p>}
              {savedChats.map((chat) => (
                <div key={chat.id} className={`p-2 rounded-lg ${T.card}`}>
                  {renamingId === chat.id ? (
                    <div className="flex gap-2">
                      <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="flex-1 px-2 py-1 rounded bg-black/20 text-sm" placeholder="New name" />
                      <button onClick={() => renameChat(chat.id)} className={`px-2 py-1 text-xs rounded ${T.accent}`}>Save</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => loadChat(chat)} className="w-full text-left px-2 py-1 rounded hover:opacity-80">
                        {chat.name}
                      </button>
                      <div className="flex justify-between items-center text-xs mt-1 gap-2">
                        <button onClick={() => { setRenamingId(chat.id); setRenameValue(chat.name); }} className="text-blue-300 hover:underline">Rename</button>
                        <div className="ml-auto flex gap-2">
                          <button onClick={() => exportChatTxt(chat)} className="text-green-300 hover:underline">TXT</button>
                          <button onClick={() => exportChatPdf(chat)} className="text-purple-300 hover:underline">PDF</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <button onClick={exportAll} className="flex items-center gap-2 text-sm hover:opacity-80"><Download size={16}/> Export All</button>
              <label className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80">
                <Upload size={16}/> Import
                <input type="file" accept="application/json" className="hidden" onChange={(e)=> e.target.files?.[0] && importAll(e.target.files[0])} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`p-6 rounded-xl w-96 ${T.panel}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Settings</h3>
              <button onClick={() => setShowSettings(false)}><X /></button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm mb-2 opacity-80">Theme</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(THEMES).map((name) => (
                    <button key={name} onClick={()=>{ setTheme(name); localStorage.setItem("appTheme", name); setDarkMode(name!=="Light"); }} className={`px-3 py-2 rounded border ${theme===name?"ring-2 ring-yellow-300":"opacity-80"} ${THEMES[name].panel}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => { const next = !darkMode; setDarkMode(next); setTheme(next?"Dark":"Light"); localStorage.setItem("appTheme", next?"Dark":"Light"); }} className={`w-full px-4 py-2 rounded-lg ${T.card}`}>
                Toggle {darkMode ? "Light" : "Dark"} Mode
              </button>
              <button onClick={clearAllSaved} className="w-full px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500">
                Clear All Saved Chats
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Voice input button component
function VoiceButton({ setInput }) {
  const { start, stop, listening } = useSpeechInput((t) => setInput((prev) => (prev ? prev + " " + t : t)));
  return (
    <button onClick={listening ? stop : start} className={`p-3 rounded-xl bg-black/20 hover:bg-black/30`} title={listening ? "Stop voice input" : "Start voice input"}>
      <Mic size={18} />
    </button>
  );
}

export default App;
