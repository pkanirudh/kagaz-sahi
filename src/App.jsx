import { useState, useRef, useCallback } from "react";

const DOCUMENT_TYPES = [
  { id: "aadhaar",        label: "Aadhaar Card",           icon: "🪪", required: true  },
  { id: "marksheet_10",   label: "10th Marksheet",          icon: "📄", required: true  },
  { id: "marksheet_grad", label: "Graduation Certificate",  icon: "🎓", required: true  },
  { id: "caste",          label: "Caste Certificate",       icon: "📋", required: false },
  { id: "dob",            label: "Birth Certificate",       icon: "📅", required: false },
  { id: "domicile",       label: "Domicile Certificate",    icon: "🏠", required: false },
];

const SYSTEM_PROMPT = `You are an expert SSC CGL document verification assistant for Indian government job applicants.

Analyze the provided documents and extract identity fields, then cross-verify them for consistency.

IMPORTANT: Indian documents may be in Hindi, English, or mixed scripts. Handle both Devanagari and Latin.

Common disqualifying issues to check:
- Name spelling differences across docs (e.g. "Rahul" vs "Rahull", "Mohammad" vs "Mohammed", abbreviated middle names)
- Date of birth format mismatches (DD/MM/YYYY vs written format vs DD-MM-YYYY)
- Father's name discrepancies
- Category/caste mismatches (OBC vs OBC-NCL vs General)
- Certificate validity (caste cert should be recent; some states require within 3 years)
- Domicile state mismatches
- Educational qualification details

Respond ONLY in valid JSON with this exact structure — no markdown, no extra text, no code fences:
{
  "candidate_summary": {
    "name_found": "most consistent name spelling",
    "dob_found": "date of birth",
    "category_found": "category or null",
    "documents_analyzed": ["list of doc type labels detected"]
  },
  "field_checks": [
    {
      "field": "field name",
      "values": { "DocLabel": "extracted value" },
      "status": "CRITICAL|WARNING|OK",
      "message": "plain English explanation a first-gen govt job applicant can understand"
    }
  ],
  "overall_status": "READY|AT_RISK|NOT_READY",
  "critical_count": 0,
  "warning_count": 0,
  "ok_count": 0,
  "summary_message": "2-3 sentence summary in plain English",
  "next_steps": ["actionable step 1", "actionable step 2", "actionable step 3"]
}`;

const DEMO_RESULT = {
  candidate_summary: {
    name_found: "Rajesh Kumar Sharma",
    dob_found: "15/03/1998",
    category_found: "OBC-NCL",
    documents_analyzed: ["Aadhaar Card", "10th Marksheet", "Graduation Certificate", "Caste Certificate"]
  },
  field_checks: [
    {
      field: "Full Name",
      values: { "Aadhaar": "RAJESH KUMAR SHARMA", "10th Marksheet": "Rajesh K. Sharma", "Graduation": "Rajesh Kumar Sharma" },
      status: "CRITICAL",
      message: "Your 10th Marksheet shows 'Rajesh K. Sharma' but Aadhaar shows 'Rajesh Kumar Sharma'. SSC requires exact name match across all documents. This WILL cause disqualification at document verification — even after clearing both exams."
    },
    {
      field: "Date of Birth",
      values: { "Aadhaar": "15/03/1998", "10th Marksheet": "15-Mar-1998", "Graduation": "15/03/1998" },
      status: "OK",
      message: "Date of birth is consistent across all documents (15 March 1998). Different formats like DD/MM/YYYY and written dates are acceptable as long as the underlying date matches."
    },
    {
      field: "Father's Name",
      values: { "Aadhaar": "Suresh Sharma", "10th Marksheet": "Suresh Kumar Sharma" },
      status: "WARNING",
      message: "Aadhaar shows father's name as 'Suresh Sharma' while the 10th marksheet shows 'Suresh Kumar Sharma'. This may be questioned during document verification. Keep a notarised affidavit explaining the difference as supporting documentation."
    },
    {
      field: "Category",
      values: { "Caste Certificate": "OBC (Non-Creamy Layer)", "Application": "OBC-NCL" },
      status: "OK",
      message: "OBC-NCL declared in your application correctly matches your caste certificate. Consistent."
    },
    {
      field: "Caste Certificate Validity",
      values: { "Caste Certificate": "Issued: June 2019" },
      status: "WARNING",
      message: "Your caste certificate was issued in 2019 — over 5 years ago. SSC and many states require a fresh certificate (within 3 years). Check your state's specific requirement and consider getting a new one from your district authority."
    },
    {
      field: "Educational Qualification",
      values: { "Graduation": "B.Com, University of Rajasthan, 2020" },
      status: "OK",
      message: "Graduation certificate confirms a recognised degree. Meets SSC CGL educational eligibility."
    }
  ],
  overall_status: "AT_RISK",
  critical_count: 1,
  warning_count: 2,
  ok_count: 3,
  summary_message: "Your documents have 1 critical issue that will likely cause disqualification: the name mismatch between your Aadhaar and 10th Marksheet. You must get this corrected before your document verification date. There are also 2 warnings that should be addressed proactively.",
  next_steps: [
    "Get your 10th Marksheet name corrected to 'Rajesh Kumar Sharma' through your school/board office — this is a mandatory fix and cannot be deferred.",
    "Apply for a fresh OBC-NCL caste certificate from your district collectorate if your current one is more than 3 years old.",
    "Prepare a notarised affidavit explaining the father's name difference between Aadhaar ('Suresh Sharma') and marksheet ('Suresh Kumar Sharma') as supporting documentation.",
    "Carry all original documents plus 2 sets of self-attested photocopies to the document verification venue."
  ]
};

async function compressImage(file) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const maxDim = 1600;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      canvas.width = width; canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.82;
      const compress = () => {
        canvas.toBlob((blob) => {
          if (blob.size > 1.4 * 1024 * 1024 && quality > 0.3) { quality -= 0.1; compress(); return; }
          const reader = new FileReader();
          reader.onload = (e) => resolve({ base64: e.target.result.split(",")[1], preview: e.target.result });
          reader.readAsDataURL(blob);
        }, "image/jpeg", quality);
      };
      compress();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const reader = new FileReader();
      reader.onload = (e) => resolve({ base64: e.target.result.split(",")[1], preview: e.target.result });
      reader.readAsDataURL(file);
    };
    img.src = url;
  });
}

function safeParseJSON(text) {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Could not parse response from Claude. Please try again.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const sc = (s) => s === "CRITICAL" ? "#ff4d4d" : s === "WARNING" ? "#f59e0b" : "#10b981";
const sb = (s) => s === "CRITICAL" ? "rgba(255,77,77,0.07)" : s === "WARNING" ? "rgba(245,158,11,0.07)" : "rgba(16,185,129,0.07)";
const sbd = (s) => s === "CRITICAL" ? "rgba(255,77,77,0.22)" : s === "WARNING" ? "rgba(245,158,11,0.22)" : "rgba(16,185,129,0.22)";
const oc = (s) => s === "NOT_READY" ? "#ff4d4d" : s === "AT_RISK" ? "#f59e0b" : "#10b981";
const ol = (s) => s === "NOT_READY" ? "⛔  Not Ready to Submit" : s === "AT_RISK" ? "⚠️  At Risk — Review Required" : "✅  Ready to Submit";

function UploadCard({ docType, uploaded, onUpload, onRemove }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const drop = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) onUpload(docType.id, f); };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={drop}
      onClick={!uploaded ? () => ref.current?.click() : undefined}
      style={{ background: uploaded ? "rgba(16,185,129,0.05)" : drag ? "rgba(232,160,32,0.07)" : "#0f1420", border: `1.5px ${uploaded ? "solid rgba(16,185,129,0.3)" : drag ? "dashed rgba(232,160,32,0.5)" : "dashed #1a2235"}`, borderRadius: 12, padding: 14, cursor: uploaded ? "default" : "pointer", transition: "all 0.18s", minHeight: 95 }}
    >
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onUpload(docType.id, e.target.files[0])} />
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{docType.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc8c0" }}>{docType.label}</div>
          <div style={{ fontSize: 9, color: docType.required ? "#e8a020" : "#2d3555", textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 1 }}>{docType.required ? "Required" : "Optional"}</div>
        </div>
        {uploaded && <button onClick={(e) => { e.stopPropagation(); onRemove(docType.id); }} style={{ background: "none", border: "none", color: "#2d3555", cursor: "pointer", fontSize: 17, padding: 0, lineHeight: 1, transition: "color 0.15s" }} onMouseEnter={(e) => e.target.style.color="#ff4d4d"} onMouseLeave={(e) => e.target.style.color="#2d3555"}>×</button>}
      </div>
      {uploaded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 10 }}>
          <img src={uploaded.preview} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, opacity: 0.8, border: "1px solid #1a2235" }} />
          <div>
            <div style={{ fontSize: 10, color: "#10b981", fontWeight: 700 }}>✓ Uploaded</div>
            <div style={{ fontSize: 9, color: "#4d5575", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{uploaded.name}</div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10, textAlign: "center", color: "#2d3555", fontSize: 10 }}>
          <div style={{ fontSize: 18, marginBottom: 2 }}>↑</div>Tap or drag to upload
        </div>
      )}
    </div>
  );
}

const LOAD_MSGS = ["Reading your documents…", "Extracting text and fields…", "Cross-verifying name spelling…", "Checking date of birth…", "Analysing category & certificates…", "Generating your report…"];

export default function DocVerify() {
  const [apiKey, setApiKey]         = useState("");
  const [apiKeySet, setApiKeySet]   = useState(false);
  const [docs, setDocs]             = useState({});
  const [analyzing, setAnalyzing]   = useState(false);
  const [loadStep, setLoadStep]     = useState(0);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);
  const timerRef = useRef(null);

  const handleUpload = useCallback(async (id, file) => {
    const compressed = await compressImage(file);
    setDocs(prev => ({ ...prev, [id]: { ...compressed, name: file.name, mediaType: "image/jpeg" } }));
  }, []);

  const handleRemove = useCallback((id) => {
    setDocs(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  const count = Object.keys(docs).length;

  const startLoader = () => {
    setLoadStep(0);
    timerRef.current = setInterval(() => setLoadStep(s => s + 1), 850);
  };
  const stopLoader = () => { clearInterval(timerRef.current); setAnalyzing(false); };

  const runDemo = () => {
    setResult(null); setError(null); setAnalyzing(true);
    startLoader();
    setTimeout(() => { stopLoader(); setResult(DEMO_RESULT); }, 5200);
  };

  const analyze = async () => {
    if (count < 2) { setError("Upload at least 2 documents to cross-verify."); return; }
    setAnalyzing(true); setError(null); setResult(null);
    startLoader();
    try {
      const entries = Object.entries(docs);
      const content = [
        { type: "text", text: `Analyse these ${entries.length} documents for SSC CGL readiness:\n${entries.map(([id, d]) => `- ${DOCUMENT_TYPES.find(t=>t.id===id)?.label||id}: ${d.name}`).join("\n")}\n\nExtract all identity fields and cross-verify:` },
        ...entries.flatMap(([id, d]) => [
          { type: "text", text: `\n=== ${DOCUMENT_TYPES.find(t=>t.id===id)?.label||id} ===` },
          { type: "image", source: { type: "base64", media_type: d.mediaType, data: d.base64 } }
        ]),
        { type: "text", text: "\nReturn the complete cross-verification JSON now. No markdown. No code fences. Pure JSON only." }
      ];
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, system: SYSTEM_PROMPT, messages: [{ role: "user", content }] }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `API error ${res.status}`); }
      const data = await res.json();
      setResult(safeParseJSON(data.content[0]?.text || ""));
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally { stopLoader(); }
  };

  const reset = () => { setResult(null); setDocs({}); setError(null); };

  return (
    <div style={{ minHeight: "100vh", background: "#080c18", color: "#d0cec8", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #1a2235; }
        .fade { animation: fu 0.3s ease forwards; }
        @keyframes fu { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .spin { animation: sp 1s linear infinite; }
        @keyframes sp { to { transform: rotate(360deg); } }
        .btn { transition: all 0.18s; cursor: pointer; }
        .btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(232,160,32,0.3); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ghost { transition: background 0.15s; cursor: pointer; }
        .ghost:hover { background: rgba(255,255,255,0.04) !important; }
        input { transition: border 0.18s; }
        input:focus { outline: none; }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: "1px solid #0e1525", padding: "14px 22px", display: "flex", alignItems: "center", gap: 11, background: "rgba(8,12,24,0.92)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#e8a020,#f5c540)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📋</div>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: "-0.3px", lineHeight: 1 }}>DocVerify</div>
          <div style={{ fontSize: 9, color: "#2d3555", letterSpacing: "0.9px", textTransform: "uppercase", marginTop: 2 }}>SSC CGL · Document Cross-Verification</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {apiKeySet && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 5px #10b981" }} />}
          <span style={{ fontSize: 9, color: "#1a2235", fontStyle: "italic" }}>Claude Vision API</span>
        </div>
      </header>

      <div style={{ maxWidth: 740, margin: "0 auto", padding: "28px 18px 64px" }}>

        {/* Hero */}
        {!result && !analyzing && (
          <div className="fade" style={{ marginBottom: 26 }}>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(20px,5vw,28px)", fontWeight: 800, lineHeight: 1.25, letterSpacing: "-0.5px", marginBottom: 10 }}>
              Know before you submit.<br />
              <span style={{ color: "#e8a020" }}>Not after you're disqualified.</span>
            </h1>
            <p style={{ fontSize: 13, color: "#5d6480", lineHeight: 1.75, maxWidth: 500 }}>
              Thousands of SSC CGL candidates get rejected at document verification for minor name mismatches and expired certificates — <em style={{ color: "#8088a0" }}>after clearing both exams and years of preparation.</em> Upload your documents and find out now.
            </p>
          </div>
        )}

        {/* API Key */}
        {!result && !analyzing && (
          <div style={{ marginBottom: 22 }}>
            {!apiKeySet ? (
              <div style={{ background: "#0d1220", border: "1px solid #1a2235", borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, marginBottom: 5 }}>Connect Anthropic API key</div>
                <div style={{ fontSize: 11, color: "#5d6480", marginBottom: 14, lineHeight: 1.65 }}>
                  Runs entirely in your browser. Key is never stored or sent to any server.
                  <span onClick={runDemo} style={{ color: "#e8a020", cursor: "pointer", marginLeft: 6 }}>Skip — try demo →</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="password" placeholder="sk-ant-api..." value={apiKey} onChange={e=>setApiKey(e.target.value)} onKeyDown={e=>e.key==="Enter"&&apiKey.startsWith("sk-")&&setApiKeySet(true)}
                    style={{ flex: 1, background: "#080c18", border: "1px solid #1a2235", borderRadius: 7, padding: "9px 12px", color: "#d0cec8", fontSize: 12, fontFamily: "monospace" }} />
                  <button className="btn" onClick={()=>apiKey.startsWith("sk-")&&setApiKeySet(true)} disabled={!apiKey.startsWith("sk-")}
                    style={{ background: "linear-gradient(135deg,#e8a020,#f5c540)", color: "#080c18", border: "none", borderRadius: 7, padding: "9px 18px", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" }}>
                    Connect →
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: 8, padding: "9px 14px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#10b981" }}>✓ API key connected</span>
                <span onClick={()=>{setApiKeySet(false);setApiKey("");}} style={{ fontSize: 10, color: "#2d3555", cursor: "pointer" }}>Change</span>
              </div>
            )}
          </div>
        )}

        {/* What Claude checks */}
        {!result && !analyzing && (
          <div style={{ background: "linear-gradient(135deg,rgba(232,160,32,0.055),transparent)", border: "1px solid rgba(232,160,32,0.1)", borderRadius: 11, padding: "14px 18px", marginBottom: 22 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#e8a020", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 9 }}>What Claude checks</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 6 }}>
              {["Name spelling consistency","Date of birth match","Father's name across docs","Category / caste validity","Certificate expiry","Educational qualification"].map(item=>(
                <div key={item} style={{ fontSize: 11, color: "#7078a0", display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ color: "#e8a020", fontSize: 9 }}>▸</span>{item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Grid */}
        {!result && !analyzing && (
          <div className="fade">
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              Upload your documents
              <span style={{ fontSize: 10, fontWeight: 400, color: "#2d3555", marginLeft: 9, fontFamily: "'DM Sans',sans-serif" }}>JPG / PNG · auto-compressed</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px,1fr))", gap: 10, marginBottom: 22 }}>
              {DOCUMENT_TYPES.map(dt => <UploadCard key={dt.id} docType={dt} uploaded={docs[dt.id]||null} onUpload={handleUpload} onRemove={handleRemove} />)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <button className="btn" onClick={analyze} disabled={!apiKeySet||count<2}
                style={{ background: "linear-gradient(135deg,#e8a020,#f5c540)", color: "#080c18", border: "none", borderRadius: 11, padding: "14px 42px", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, letterSpacing: "-0.2px" }}>
                Verify My Documents →
              </button>
              <div style={{ fontSize: 11, color: "#2d3555" }}>
                {count < 2 ? `Upload ${2-count} more document${count===1?"":"s"} to begin` : `${count} docs ready · Claude will cross-verify all identity fields`}
              </div>
              {!apiKeySet && (
                <button className="ghost" onClick={runDemo} style={{ background: "transparent", border: "1px solid #1a2235", borderRadius: 8, padding: "9px 22px", color: "#5d6480", fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                  Try demo instead
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading */}
        {analyzing && (
          <div style={{ textAlign: "center", padding: "52px 20px" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", border: "2.5px solid #1a2235", borderTop: "2.5px solid #e8a020", margin: "0 auto 22px", display: "block" }} className="spin" />
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Analysing with Claude Vision</div>
            <div style={{ fontSize: 12, color: "#4d5575", minHeight: 18 }}>{LOAD_MSGS[loadStep % LOAD_MSGS.length]}</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="fade" style={{ background: "rgba(255,77,77,0.07)", border: "1px solid rgba(255,77,77,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 12, color: "#ff8888", lineHeight: 1.6 }}>
            ⚠️ {error}
            {error.includes("401") && <div style={{ marginTop: 5, fontSize: 11, color: "#4d5575" }}>Your API key may be incorrect or expired.</div>}
          </div>
        )}

        {/* Results */}
        {result && !analyzing && (
          <div className="fade">

            {/* Overall Status */}
            <div style={{ background: `linear-gradient(135deg,rgba(${result.overall_status==="READY"?"16,185,129":result.overall_status==="AT_RISK"?"245,158,11":"255,77,77"},0.09),transparent)`, border: `1.5px solid ${oc(result.overall_status)}30`, borderRadius: 14, padding: "22px 24px", marginBottom: 16 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 800, color: oc(result.overall_status), marginBottom: 10 }}>
                {ol(result.overall_status)}
              </div>
              <div style={{ fontSize: 13, color: "#8890a8", lineHeight: 1.75, marginBottom: 16, maxWidth: 560 }}>{result.summary_message}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[{l:"Critical",c:result.critical_count,col:"#ff4d4d"},{l:"Warnings",c:result.warning_count,col:"#f59e0b"},{l:"Passed",c:result.ok_count,col:"#10b981"}].map(s=>(
                  <div key={s.l} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 7, padding: "7px 14px" }}>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: s.col }}>{s.c}</span>
                    <span style={{ fontSize: 11, color: "#4d5575", marginLeft: 5 }}>{s.l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Candidate Profile */}
            {result.candidate_summary && (
              <div style={{ background: "#0d1220", border: "1px solid #1a2235", borderRadius: 11, padding: "14px 18px", marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: "#2d3555", textTransform: "uppercase", letterSpacing: "0.9px", fontWeight: 700, marginBottom: 10 }}>Profile Detected</div>
                <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                  {[{l:"Name",v:result.candidate_summary.name_found},{l:"DOB",v:result.candidate_summary.dob_found},{l:"Category",v:result.candidate_summary.category_found}].filter(f=>f.v).map(f=>(
                    <div key={f.l}>
                      <div style={{ fontSize: 9, color: "#2d3555", textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.l}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc8c0", marginTop: 2 }}>{f.v}</div>
                    </div>
                  ))}
                  {result.candidate_summary.documents_analyzed?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: "#2d3555", textTransform: "uppercase", letterSpacing: "0.5px" }}>Docs Read</div>
                      <div style={{ fontSize: 11, color: "#7078a0", marginTop: 2 }}>{result.candidate_summary.documents_analyzed.join(" · ")}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Field Checks — sorted critical first */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 11 }}>Field-by-Field Verification</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...(result.field_checks||[])].sort((a,b)=>({CRITICAL:0,WARNING:1,OK:2}[a.status]??3)-({CRITICAL:0,WARNING:1,OK:2}[b.status]??3)).map((c,i)=>(
                  <div key={i} style={{ background: sb(c.status), border: `1px solid ${sbd(c.status)}`, borderLeft: `3px solid ${sc(c.status)}`, borderRadius: 9, padding: "13px 15px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc8c0" }}>{c.field}</div>
                      <div style={{ background: `${sc(c.status)}18`, color: sc(c.status), fontSize: 8, fontWeight: 800, padding: "2px 7px", borderRadius: 3, letterSpacing: "0.8px", textTransform: "uppercase", flexShrink: 0 }}>{c.status}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#7880a0", lineHeight: 1.65, marginBottom: c.values&&Object.keys(c.values).length?9:0 }}>{c.message}</div>
                    {c.values && Object.keys(c.values).length > 0 && (
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {Object.entries(c.values).map(([doc,val])=>(
                          <div key={doc} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 4, padding: "2px 8px", fontSize: 10 }}>
                            <span style={{ color: "#2d3555" }}>{doc}: </span>
                            <span style={{ color: "#b8b6b0", fontWeight: 500 }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Next Steps */}
            {result.next_steps?.length > 0 && (
              <div style={{ background: "#0d1220", border: "1px solid #1a2235", borderRadius: 12, padding: "18px 20px", marginBottom: 22 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, color: "#e8a020", marginBottom: 12 }}>What to do next</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {result.next_steps.map((step,i)=>(
                    <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(232,160,32,0.1)", color: "#e8a020", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>{i+1}</div>
                      <div style={{ fontSize: 12, color: "#7880a0", lineHeight: 1.65 }}>{step}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center" }}>
              <button className="ghost" onClick={reset} style={{ background: "transparent", border: "1px solid #1a2235", borderRadius: 9, padding: "9px 22px", color: "#4d5575", fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                ← Check different documents
              </button>
            </div>

            <div style={{ marginTop: 30, borderTop: "1px solid #0e1525", paddingTop: 16, textAlign: "center", fontSize: 9, color: "#1a2235", lineHeight: 2 }}>
              DocVerify · Proof of Concept · Built with Claude Vision API<br />
              Always verify against official SSC CGL notification at ssc.gov.in
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
