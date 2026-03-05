import { useState, useRef, useCallback } from "react";

const BACKEND = "http://localhost:8000";

async function loadPdfJs() {
  if (window._pdfjs) return window._pdfjs;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  window._pdfjs = window.pdfjsLib;
  return window._pdfjs;
}

async function extractPdfText(file) {
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((s) => s.str).join(" ") + "\n";
  }
  return text.trim();
}

async function askBackend(fileObj, question) {
  const form = new FormData();
  form.append("file",     fileObj.file);
  form.append("question", question);
  const res  = await fetch(`${BACKEND}/ask`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);
  return data.answer;
}

const ACCEPTED = {
  "application/pdf": "pdf",
};

const SUGGESTIONS = {
  pdf: [
    "What is the main topic of this document?",
    "What are the key findings or conclusions?",
    "Summarize this document briefly",
    "What problem does this document address?",
    "List the most important points",
  ],
  image: [
    "What is shown in this image?",
    "Describe the main subject in detail",
    "What text appears in this image?",
    "What colors and objects are visible?",
    "What is the overall theme or mood?",
  ],
};

const Ic = ({ d, size = 20, fill = false }) => (
  <svg width={size} height={size}
    fill={fill ? "currentColor" : "none"}
    stroke={fill ? "none" : "currentColor"}
    strokeWidth="1.8" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const D = {
  upload: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
  send:   "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
  doc:    "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  img:    "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  trash:  "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0",
  star:   "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
};

export default function DocMind() {
  const [doc,        setDoc]        = useState(null);
  const [qa,         setQa]         = useState([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [dragging,   setDragging]   = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error,      setError]      = useState("");
  const [backendOk,  setBackendOk]  = useState(null);

  const fileRef  = useRef();
  const chatRef  = useRef();
  const inputRef = useRef();

  const pingBackend = async () => {
    try {
      const r = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(3000) });
      setBackendOk(r.ok); return r.ok;
    } catch { setBackendOk(false); return false; }
  };

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const kind = ACCEPTED[file.type];
    if (!kind) { setError("Please upload a PDF)."); return; }
    if (file.size > 30 * 1024 * 1024) { setError("File too large. Max 30 MB."); return; }

    setError(""); setQa([]);
    setProcessing(true);

    const alive = await pingBackend();
    if (!alive) {
      setError("Backend is not running.\n\nIn your terminal:\ncd backend\nuvicorn main:app --reload --port 8000");
      setProcessing(false); return;
    }

    if (kind === "pdf") {
      try { await extractPdfText(file); } catch { /* warm up only */ }
    }

    const preview = kind === "image" ? URL.createObjectURL(file) : null;
    setDoc({ file, name: file.name, kind, preview, size: (file.size / 1024).toFixed(1) });
    setProcessing(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const sendQ = async (question) => {
    if (!question.trim() || !doc || loading) return;
    setInput(""); setError(""); setLoading(true);
    const q  = question.trim();
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    try {
      const a = await askBackend(doc, q);
      setQa((p) => [...p, { q, a, ts }]);
      setTimeout(() => chatRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 80);
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError"))
        setError("Cannot reach backend. Make sure it's running on port 8000.");
      else if (msg.toLowerCase().includes("loading"))
        setError("Model is warming up. Please wait 20 seconds and try again.");
      else
        setError(msg);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const reset = () => { setDoc(null); setQa([]); setInput(""); setError(""); setBackendOk(null); };
  const suggs = doc ? SUGGESTIONS[doc.kind] : [];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');

        :root {
          --bg:    #0a0c0a;
          --surf:  #101410;
          --surf2: #141914;
          --bdr:   rgba(255,255,255,0.07);
          --g1:    #4ade80;
          --g2:    #22c55e;
          --g3:    #16a34a;
          --text:  #e2e8e2;
          --muted: rgba(226,232,226,0.45);
          --dim:   rgba(255,255,255,0.06);
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html, body, #root {
          height: 100%;
          width: 100%;
          background: var(--bg);
          font-family: 'Outfit', sans-serif;
          color: var(--text);
        }

        .app {
          height: 100vh;
          width: 100vw;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 60% 50% at 10% 20%, rgba(74,222,128,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 40% 50% at 90% 80%, rgba(34,197,94,0.05) 0%, transparent 60%);
        }

        header {
          position: relative; z-index: 20; padding: 0 32px;
          height: 60px; display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid var(--bdr);
          background: rgba(10,12,10,0.9); backdrop-filter: blur(16px);
          flex-shrink: 0;
        }

        .logo { display: flex; align-items: center; gap: 10px; }
        .logo-dot {
          width: 30px; height: 30px; border-radius: 8px;
          background: linear-gradient(135deg, var(--g1), var(--g3));
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; box-shadow: 0 0 14px rgba(74,222,128,0.3);
        }
        .logo-name { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; }
        .logo-name span { color: var(--g1); }

        .status {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 600; letter-spacing: .5px;
          text-transform: uppercase; padding: 5px 12px; border-radius: 20px;
        }
        .status.ok   { color: var(--g1); background: rgba(74,222,128,.08); border: 1px solid rgba(74,222,128,.18); }
        .status.fail { color: #f87171; background: rgba(248,113,113,.08); border: 1px solid rgba(248,113,113,.18); }
        .status.idle { color: var(--muted); background: var(--dim); border: 1px solid var(--bdr); }
        .sdot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

        /* ── MAIN AREA ── */
        .main {
          flex: 1;
          width: 100%;
          position: relative;
          z-index: 5;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        /* ── Upload screen ── */
        .up-zone {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          gap: 24px;
        }

        .up-card {
          width: 100%;
          max-width: 520px;
          text-align: center;
          cursor: pointer;
          background: var(--surf);
          border: 2px dashed rgba(255,255,255,0.1);
          border-radius: 20px;
          padding: 52px 36px;
          transition: all .2s;
          box-shadow: 0 10px 40px rgba(0,0,0,0.35);
        }
        .up-card:hover { border-color: rgba(74,222,128,.35); background: rgba(74,222,128,.03); }
        .up-card.drag  { border-color: var(--g1); background: rgba(74,222,128,.05); transform: scale(1.01); }

        .up-icon  { color: rgba(74,222,128,.6); margin-bottom: 18px; display: flex; justify-content: center; }
        .up-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
        .up-sub   { font-size: 13px; color: var(--muted); line-height: 1.65; margin-bottom: 24px; }

        .file-chips { display: flex; justify-content: center; gap: 7px; flex-wrap: wrap; margin-bottom: 24px; }
        .fchip {
          font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;
          padding: 3px 10px; border-radius: 6px; border: 1px solid;
          color: var(--g1); border-color: rgba(74,222,128,.25); background: rgba(74,222,128,.07);
        }

        .up-btn {
          background: linear-gradient(135deg, var(--g1), var(--g2));
          color: #0a0c0a; border: none; border-radius: 10px; padding: 12px 28px;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700;
          cursor: pointer; transition: all .18s; box-shadow: 0 4px 16px rgba(74,222,128,.2);
        }
        .up-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(74,222,128,.3); }

        .err-box {
          width: 100%; max-width: 520px;
          font-size: 12px; color: #fca5a5;
          background: rgba(248,113,113,.07); border: 1px solid rgba(248,113,113,.15);
          border-radius: 8px; padding: 8px 12px;
          line-height: 1.55; white-space: pre-wrap;
        }

        /* ── Processing ── */
        .proc {
          width: 100%; height: 100%;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 14px;
        }
        .spin {
          width: 40px; height: 40px;
          border: 2.5px solid rgba(74,222,128,.15);
          border-top-color: var(--g1);
          border-radius: 50%; animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .proc-t { font-size: 14px; color: var(--muted); font-weight: 500; }

        /* ── QA layout ── */
        .qa-wrap {
          width: 100%;
          height: 100%;
          display: grid;
          grid-template-columns: 260px 1fr;
          overflow: hidden;
        }

        .sidebar {
          background: var(--surf); border-right: 1px solid var(--bdr);
          padding: 16px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto;
        }
        .sidebar::-webkit-scrollbar { width: 3px; }
        .sidebar::-webkit-scrollbar-thumb { background: var(--dim); border-radius: 2px; }

        .dcard {
          background: rgba(74,222,128,.05); border: 1px solid rgba(74,222,128,.12);
          border-radius: 12px; padding: 12px;
        }
        .dprev { width: 100%; border-radius: 7px; margin-bottom: 8px; max-height: 130px; object-fit: cover; border: 1px solid var(--bdr); }
        .drow  { display: flex; align-items: flex-start; gap: 8px; }
        .dico  { flex-shrink: 0; margin-top: 1px; color: var(--g1); }
        .dname { font-size: 12px; font-weight: 600; word-break: break-word; line-height: 1.4; margin-bottom: 5px; }
        .dmeta { display: flex; gap: 6px; flex-wrap: wrap; }
        .dtag  { font-size: 10px; color: var(--muted); background: var(--dim); padding: 2px 7px; border-radius: 5px; }

        .slbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,.2); padding: 4px 0 2px; }
        .sugg {
          width: 100%; background: transparent; border: 1px solid var(--bdr);
          border-radius: 8px; padding: 9px 11px; text-align: left; color: var(--muted);
          font-family: 'Outfit', sans-serif; font-size: 12px; line-height: 1.45;
          cursor: pointer; transition: all .12s; display: flex; align-items: flex-start; gap: 7px;
        }
        .sugg:hover    { background: rgba(74,222,128,.06); border-color: rgba(74,222,128,.2); color: var(--text); }
        .sugg:disabled { opacity: .35; cursor: not-allowed; }
        .sugg-ico { color: var(--g1); flex-shrink: 0; margin-top: 1px; }

        .new-btn {
          margin-top: auto; padding: 9px; border-radius: 8px; cursor: pointer;
          background: rgba(255,255,255,.03); border: 1px solid var(--bdr);
          color: var(--muted); font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          transition: all .12s;
        }
        .new-btn:hover { background: rgba(255,255,255,.06); color: var(--text); }

        .cpanel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

        .msgs {
          flex: 1; overflow-y: auto; padding: 28px 32px;
          display: flex; flex-direction: column; gap: 20px;
        }
        .msgs::-webkit-scrollbar { width: 3px; }
        .msgs::-webkit-scrollbar-thumb { background: var(--dim); border-radius: 2px; }

        .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 8px; }
        .empty-icon  { font-size: 48px; opacity: .08; line-height: 1; }
        .empty-title { font-size: 18px; font-weight: 600; color: rgba(255,255,255,.2); }
        .empty-sub   { font-size: 12px; color: rgba(255,255,255,.12); }

        .mpair { display: flex; flex-direction: column; gap: 8px; }
        .msg   { display: flex; flex-direction: column; max-width: 75%; }
        .msg.u { align-self: flex-end;  align-items: flex-end; }
        .msg.a { align-self: flex-start; align-items: flex-start; }
        .mtime { font-size: 10px; color: rgba(255,255,255,.18); margin-bottom: 3px; }
        .albl  {
          font-size: 10px; font-weight: 700; color: var(--g1);
          text-transform: uppercase; letter-spacing: .6px; margin-bottom: 3px;
          display: flex; align-items: center; gap: 3px;
        }
        .bub { border-radius: 14px; padding: 12px 16px; font-size: 13.5px; line-height: 1.7; }
        .bub.u { background: linear-gradient(135deg, var(--g1), var(--g2)); color: #0a0c0a; border-bottom-right-radius: 3px; font-weight: 500; }
        .bub.a { background: var(--surf2); border: 1px solid var(--bdr); color: var(--text); border-bottom-left-radius: 3px; white-space: pre-wrap; }

        .thinking {
          align-self: flex-start; display: flex; align-items: center; gap: 9px;
          background: var(--surf2); border: 1px solid var(--bdr);
          border-radius: 12px; padding: 11px 15px;
        }
        .dots { display: flex; gap: 4px; }
        .dot  { width: 5px; height: 5px; border-radius: 50%; background: var(--g1); animation: blink 1.2s ease-in-out infinite; }
        .dot:nth-child(2) { animation-delay: .2s; }
        .dot:nth-child(3) { animation-delay: .4s; }
        @keyframes blink { 0%,80%,100% { opacity: .2; } 40% { opacity: 1; } }
        .thtxt { font-size: 12px; color: var(--muted); }

        .ibar {
          padding: 14px 32px 18px;
          border-top: 1px solid var(--bdr);
          background: rgba(10,12,10,.8);
          flex-shrink: 0;
        }
        .ibar .err-box { max-width: 100%; margin-bottom: 10px; }
        .irow  { display: flex; gap: 8px; align-items: flex-end; }
        .iwrap {
          flex: 1; background: var(--surf2); border: 1.5px solid var(--bdr);
          border-radius: 12px; padding: 11px 15px; transition: border-color .14s;
        }
        .iwrap:focus-within { border-color: rgba(74,222,128,.4); background: rgba(74,222,128,.02); }
        textarea.qi {
          width: 100%; background: transparent; border: none; outline: none;
          color: var(--text); font-family: 'Outfit', sans-serif;
          font-size: 13.5px; line-height: 1.5; resize: none;
          min-height: 22px; max-height: 110px; overflow-y: auto;
        }
        textarea.qi::placeholder { color: rgba(255,255,255,.2); }

        .send-btn {
          width: 44px; height: 44px; border-radius: 11px; flex-shrink: 0;
          background: linear-gradient(135deg, var(--g1), var(--g2));
          border: none; cursor: pointer; color: #0a0c0a;
          display: flex; align-items: center; justify-content: center;
          transition: all .17s; box-shadow: 0 3px 12px rgba(74,222,128,.2);
        }
        .send-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 18px rgba(74,222,128,.3); }
        .send-btn:disabled { opacity: .35; cursor: not-allowed; transform: none; }

        .hint { font-size: 10px; color: rgba(255,255,255,.15); margin-top: 7px; text-align: center; }

        @media (max-width: 680px) {
          .qa-wrap { grid-template-columns: 1fr; }
          .sidebar { display: none; }
          .msgs, .ibar { padding: 14px; }
          header { padding: 0 16px; }
        }
      `}</style>

      <div className="app">
        <div className="glow" />

        <header>
          <div className="logo">
            <div className="logo-dot">📄</div>
            <div className="logo-name">Doc<span>Mind</span></div>
          </div>
          {backendOk === true  && <div className="status ok"><div className="sdot" />Backend Online</div>}
          {backendOk === false && <div className="status fail"><div className="sdot" />Backend Offline</div>}
          {backendOk === null  && <div className="status idle"><div className="sdot" />Developed by Swaroop</div>}
        </header>

        <div className="main">

          {/* Upload */}
          {!doc && !processing && (
            <div className="up-zone">
              <div
                className={`up-card ${dragging ? "drag" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current.click()}
              >
                <div className="up-icon"><Ic d={D.upload} size={42} /></div>
                <div className="up-title">Upload your file</div>
                <div className="up-sub">
                  Drop a PDF  here and ask any question about it.<br />
                  Powered by open-source AI models.
                </div>
                
                <button className="up-btn" onClick={(e) => { e.stopPropagation(); fileRef.current.click(); }}>
                  Choose File
                </button>
                <input ref={fileRef} type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
              </div>
              {error && <div className="err-box">{error}</div>}
            </div>
          )}

          {/* Processing */}
          {processing && (
            <div className="proc">
              <div className="spin" />
              <div className="proc-t">Loading file…</div>
            </div>
          )}

          {/* QA */}
          {doc && !processing && (
            <div className="qa-wrap">
              <div className="sidebar">
                <div className="dcard">
                  {doc.kind === "image" && doc.preview && (
                    <img src={doc.preview} alt="preview" className="dprev" />
                  )}
                  <div className="drow">
                    <div className="dico"><Ic d={doc.kind === "pdf" ? D.doc : D.img} size={16} /></div>
                    <div>
                      <div className="dname">{doc.name}</div>
                      <div className="dmeta">
                        <span className="dtag">{doc.kind.toUpperCase()}</span>
                        <span className="dtag">{doc.size} KB</span>
                        <span className="dtag">{qa.length} Q&amp;A</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="slbl">Suggestions</div>
                {suggs.map(s => (
                  <button key={s} className="sugg" disabled={loading} onClick={() => sendQ(s)}>
                    <span className="sugg-ico"><Ic d={D.star} size={11} fill /></span>
                    {s}
                  </button>
                ))}
                <button className="new-btn" onClick={reset}>
                  <Ic d={D.trash} size={13} /> New File
                </button>
              </div>

              <div className="cpanel">
                <div className="msgs" ref={chatRef}>
                  {qa.length === 0 && !loading && (
                    <div className="empty">
                      <div className="empty-icon">{doc.kind === "image" ? "🖼" : "📄"}</div>
                      <div className="empty-title">Ready to answer</div>
                      <div className="empty-sub">Ask anything about <strong style={{ color: "rgba(255,255,255,.3)" }}>{doc.name}</strong></div>
                    </div>
                  )}
                  {qa.map((item, i) => (
                    <div className="mpair" key={i}>
                      <div className="msg u">
                        <div className="mtime">{item.ts}</div>
                        <div className="bub u">{item.q}</div>
                      </div>
                      <div className="msg a">
                        <div className="albl"><Ic d={D.star} size={10} fill /> DocMind</div>
                        <div className="bub a">{item.a}</div>
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="thinking">
                      <div className="dots">
                        <div className="dot" /><div className="dot" /><div className="dot" />
                      </div>
                      <span className="thtxt">Thinking…</span>
                    </div>
                  )}
                </div>

                <div className="ibar">
                  {error && <div className="err-box">{error}</div>}
                  <div className="irow">
                    <div className="iwrap">
                      <textarea
                        ref={inputRef} className="qi" rows={1}
                        placeholder={`Ask anything about your ${doc.kind}…`}
                        value={input} disabled={loading}
                        onChange={(e) => {
                          setInput(e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = Math.min(e.target.scrollHeight, 110) + "px";
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQ(input); }
                        }}
                      />
                    </div>
                    <button className="send-btn" disabled={loading || !input.trim()} onClick={() => sendQ(input)}>
                      <Ic d={D.send} size={16} />
                    </button>
                  </div>
                  <div className="hint">Enter to send · Shift+Enter for new line</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}