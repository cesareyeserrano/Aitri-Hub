import { useState, useEffect } from "react";

// ── Tokens: JetBrains Mono + Jarvis color palette ─────────────────────────
const F  = "'JetBrains Mono', 'Courier New', monospace";
const C  = {
  bg:       "#010810",
  layer1:   "#020D1A",
  layer2:   "#041525",
  cyan:     "#00D4FF",
  cyanDim:  "#0090BB",
  cyanFaint:"rgba(0,212,255,0.06)",
  cyanGlow: "rgba(0,212,255,0.3)",
  cyanLine: "rgba(0,212,255,0.15)",
  green:    "#00FF9C",
  red:      "#FF2D55",
  yellow:   "#FFD60A",
  orange:   "#FF6B00",
  purple:   "#7B61FF",
  text:     "#C8E8FF",
  dim:      "#3A6080",
  muted:    "#0F2030",
  border:   "rgba(0,212,255,0.12)",
  borderHi: "rgba(0,212,255,0.28)",
  // Glass tokens for detail view
  glass:    "rgba(2,13,26,0.85)",
  glassBorder:"rgba(0,212,255,0.15)",
};

const SC   = { healthy:C.green, warning:C.yellow, error:C.red, stalled:C.dim };
const HEALTH_META = {
  healthy:  { label:"NOMINAL",   color:C.green,  glow:"rgba(0,255,156,0.22)" },
  at_risk:  { label:"AT RISK",   color:C.yellow, glow:"rgba(255,214,10,0.20)" },
  critical: { label:"CRITICAL",  color:C.red,    glow:"rgba(255,45,85,0.28)" },
};
const DIM_LABEL = { pipeline:"Pipeline", tests:"Tests", code:"Code", artifacts:"Artifacts", version:"Version" };
const PHASES_SHORT = ["PLN","ARC","COD","TST","DEP"];
const ARTIFACT_COL = { approved:C.green, in_progress:C.cyan, pending_approval:C.yellow, rejected:C.red, pending:C.dim };

// ── Health engine (schema-accurate) ───────────────────────────────────────
function computeHealth(p) {
  const issues = [];
  // Pipeline
  const pendingApproval = p.completedPhases.filter(ph => !p.approvedPhases.includes(ph));
  if (pendingApproval.length > 0)
    issues.push({ dim:"pipeline", level:"warn", msg:`${pendingApproval.length} phase(s) completed — awaiting human approval` });
  if (p.driftPhases?.length > 0)
    issues.push({ dim:"pipeline", level:"critical", msg:`Drift in phase(s): ${p.driftPhases.join(", ")}` });
  // Tests
  if (p.verifySummary?.failed > 0)
    issues.push({ dim:"tests", level:"critical", msg:`${p.verifySummary.failed} test(s) failing` });
  if (!p.verifyPassed && p.currentPhase >= 4)
    issues.push({ dim:"tests", level:"critical", msg:"verify-complete not passed — Phase 5 locked" });
  if (p.verifyRanAt) {
    const h = (Date.now()-new Date(p.verifyRanAt))/36e5;
    if (h > 72) issues.push({ dim:"tests", level:"warn", msg:`Tests stale — last run ${Math.round(h/24)}d ago` });
    else if (h > 48) issues.push({ dim:"tests", level:"warn", msg:`Tests last run ${Math.round(h)}h ago` });
  } else if (p.currentPhase >= 3) {
    issues.push({ dim:"tests", level:"warn", msg:"No test run recorded" });
  }
  // Code
  if (p.commitsPending > 0)
    issues.push({ dim:"code", level:"warn", msg:`${p.commitsPending} commit(s) not pushed` });
  if (p.normalizeState?.status==="pending")
    issues.push({ dim:"code", level:"warn", msg:"Off-pipeline changes pending reconciliation" });
  // Artifacts
  if (pendingApproval.length > 0)
    issues.push({ dim:"artifacts", level:"warn", msg:`${pendingApproval.length} artifact(s) need approval` });
  if (p.rejections && Object.keys(p.rejections).length > 0) {
    const last = Object.entries(p.rejections).pop();
    issues.push({ dim:"artifacts", level:"critical", msg:`Phase ${last[0]} rejected: "${last[1].feedback}"` });
  }
  if (p.externalSignals) {
    p.externalSignals.forEach(s => {
      issues.push({ dim:"artifacts",
        level:s.severity==="error"||s.severity==="blocking"?"critical":"warn",
        msg:`[${s.tool}] ${s.message}` });
    });
  }
  // Version
  if (p.versionMismatch)
    issues.push({ dim:"version", level:"warn", msg:`v${p.aitriVersion} ≠ v${p.installedVersion} — run \`aitri adopt --upgrade\`` });

  const hasCrit = issues.some(i=>i.level==="critical");
  const hasWarn = issues.some(i=>i.level==="warn");
  return { overall: hasCrit?"critical":hasWarn?"at_risk":"healthy", issues };
}

// ── Data (schema-accurate mock) ───────────────────────────────────────────
const PROJECTS = [
  {
    id:"ecommerce-api", name:"ECOMMERCE_API", type:"local",
    description:"E-commerce REST API with inventory management",
    path:"~/projects/ecommerce-api", branch:"main",
    currentPhase:2, approvedPhases:[1], completedPhases:[1,2],
    driftPhases:["2"],
    verifySummary:{ passed:12, failed:8, skipped:2, total:22 },
    verifyPassed:false, verifyRanAt:"2026-04-14T10:00:00Z",
    rejections:{ "2":{ at:"2026-04-14T09:00:00Z", feedback:"Architecture does not account for inventory sync latency. Missing circuit breaker for payment gateway." }},
    lastSession:{ at:"2026-04-14T18:00:00Z", agent:"claude", event:"complete architecture", context:"Revised service boundaries", files_touched:["src/inventory.js","src/payment.js"] },
    events:[
      { at:"2026-04-08T10:00:00Z", event:"approved", phase:1 },
      { at:"2026-04-12T14:00:00Z", event:"completed", phase:2 },
      { at:"2026-04-14T09:00:00Z", event:"rejected",  phase:2, feedback:"Architecture does not account for inventory sync latency." },
    ],
    commitsPending:3, normalizeState:null,
    aitriVersion:"0.1.75", installedVersion:"0.1.80", versionMismatch:true,
    externalSignals:[{ tool:"npm-audit", type:"security", severity:"error", message:"2 critical vulnerabilities", command:"npm audit fix" }],
    artifactTree:[
      { id:"f1", name:"01_REQUIREMENTS.json", phase:"1", status:"approved",  size:"5.6 KB", updated:"8d ago" },
      { id:"f2", name:"02_SYSTEM_DESIGN.md",  phase:"2", status:"rejected",  size:"11.2 KB",updated:"4d ago" },
    ],
    commits:[
      { hash:"c3d1b8", msg:"chore: update dependencies", time:"4d" },
      { hash:"b8f2a1", msg:"fix: broken route handler",  time:"6d" },
    ],
  },
  {
    id:"aitri-hub", name:"AITRI_HUB", type:"remote",
    description:"Centralized dashboard for all Aitri-managed projects",
    path:"github/cesareyeserrano/aitri-hub", branch:"feat/web-dashboard",
    currentPhase:3, approvedPhases:[1,2], completedPhases:[1,2,3],
    driftPhases:[],
    verifySummary:{ passed:41, failed:0, skipped:3, total:44 },
    verifyPassed:false, verifyRanAt:"2026-04-16T08:00:00Z",
    rejections:{},
    lastSession:{ at:"2026-04-17T18:00:00Z", agent:"claude", event:"complete coding", context:"Web dashboard React skeleton done", files_touched:["web/src/App.jsx","web/src/styles.css"] },
    events:[
      { at:"2026-04-10T10:00:00Z", event:"approved",  phase:1 },
      { at:"2026-04-12T14:00:00Z", event:"approved",  phase:2 },
      { at:"2026-04-17T18:00:00Z", event:"completed", phase:3 },
    ],
    commitsPending:0, normalizeState:null,
    aitriVersion:"0.1.80", installedVersion:"0.1.80", versionMismatch:false,
    externalSignals:[{ tool:"eslint", type:"code-quality", severity:"warning", message:"15 lint errors in web/src/", command:"npm run lint" }],
    artifactTree:[
      { id:"g1", name:"01_REQUIREMENTS.json", phase:"1", status:"approved",          size:"3.1 KB", updated:"8d ago" },
      { id:"g2", name:"02_SYSTEM_DESIGN.md",  phase:"2", status:"approved",          size:"9.4 KB", updated:"6d ago" },
      { id:"g3", name:"03_TEST_CASES.json",   phase:"3", status:"pending_approval",  size:"7.8 KB", updated:"1d ago" },
    ],
    commits:[
      { hash:"f2c1a9", msg:"wip: web dashboard React skeleton",    time:"18h" },
      { hash:"e9b3d4", msg:"fix: collector timeout on remote repos",time:"2d" },
    ],
  },
  {
    id:"finance-app", name:"FINANCE_APP", type:"local",
    description:"Personal finance tracker — Colombia/COP",
    path:"~/projects/finance-app", branch:"main",
    currentPhase:4, approvedPhases:[1,2,3,4], completedPhases:[1,2,3,4],
    driftPhases:[],
    verifySummary:{ passed:89, failed:0, skipped:3, total:92 },
    verifyPassed:true, verifyRanAt:"2026-04-18T06:00:00Z",
    rejections:{},
    lastSession:{ at:"2026-04-18T08:00:00Z", agent:"claude", event:"approve tests", context:"All test cases passing", files_touched:[] },
    events:[
      { at:"2026-04-01T10:00:00Z", event:"approved", phase:1 },
      { at:"2026-04-05T14:00:00Z", event:"approved", phase:2 },
      { at:"2026-04-10T16:00:00Z", event:"approved", phase:3 },
      { at:"2026-04-17T18:00:00Z", event:"approved", phase:4 },
    ],
    commitsPending:0, normalizeState:null,
    aitriVersion:"0.1.80", installedVersion:"0.1.80", versionMismatch:false,
    externalSignals:[],
    artifactTree:[
      { id:"h1", name:"01_REQUIREMENTS.json",           phase:"1", status:"approved", size:"4.2 KB",  updated:"17d ago" },
      { id:"h2", name:"02_SYSTEM_DESIGN.md",            phase:"2", status:"approved", size:"8.7 KB",  updated:"13d ago" },
      { id:"h3", name:"03_TEST_CASES.json",             phase:"3", status:"approved", size:"5.1 KB",  updated:"8d ago"  },
      { id:"h4", name:"04_IMPLEMENTATION_MANIFEST.json",phase:"4", status:"approved", size:"6.3 KB",  updated:"1d ago"  },
    ],
    commits:[
      { hash:"a3f9c1", msg:"fix: edge case in COP formatter", time:"2h" },
      { hash:"b1e4d2", msg:"feat: budget projection chart",   time:"6h" },
    ],
  },
  {
    id:"cesareyes-ai", name:"CESAREYES_AI", type:"remote",
    description:"Conversational AI digital twin — RAG-powered",
    path:"github/cesareyeserrano/cesareyes-ai", branch:"main",
    currentPhase:5, approvedPhases:[1,2,3,4,5], completedPhases:[1,2,3,4,5],
    driftPhases:[],
    verifySummary:{ passed:120, failed:0, skipped:0, total:120 },
    verifyPassed:true, verifyRanAt:"2026-04-18T05:00:00Z",
    rejections:{},
    lastSession:{ at:"2026-04-18T07:30:00Z", agent:"claude", event:"approve deployment", context:"v1.2.0 deployed", files_touched:[] },
    events:[
      { at:"2026-04-01T10:00:00Z", event:"approved", phase:1 },
      { at:"2026-04-05T10:00:00Z", event:"approved", phase:2 },
      { at:"2026-04-10T10:00:00Z", event:"approved", phase:3 },
      { at:"2026-04-14T10:00:00Z", event:"approved", phase:4 },
      { at:"2026-04-18T07:30:00Z", event:"approved", phase:5 },
    ],
    commitsPending:0, normalizeState:null,
    aitriVersion:"0.1.80", installedVersion:"0.1.80", versionMismatch:false,
    externalSignals:[],
    artifactTree:[
      { id:"i1", name:"01_REQUIREMENTS.json",           phase:"1", status:"approved", size:"6.8 KB",  updated:"17d ago" },
      { id:"i2", name:"02_SYSTEM_DESIGN.md",            phase:"2", status:"approved", size:"14.3 KB", updated:"13d ago" },
      { id:"i3", name:"03_TEST_CASES.json",             phase:"3", status:"approved", size:"18.2 KB", updated:"8d ago"  },
      { id:"i4", name:"04_IMPLEMENTATION_MANIFEST.json",phase:"4", status:"approved", size:"9.1 KB",  updated:"4d ago"  },
      { id:"i5", name:"05_PROOF_OF_COMPLIANCE.json",    phase:"5", status:"approved", size:"4.5 KB",  updated:"12h ago" },
    ],
    commits:[
      { hash:"a1b2c3", msg:"deploy: v1.2.0 — RAG confidence scoring", time:"30m" },
      { hash:"b3c4d5", msg:"feat: synthetic response delay tuning",    time:"3h"  },
    ],
  },
  {
    id:"aitri-spec", name:"AITRI_SPEC", type:"local",
    description:"Intelligent spec orchestrator — atomic feature contracts",
    path:"~/projects/aitri-spec", branch:"main",
    currentPhase:1, approvedPhases:[], completedPhases:[],
    driftPhases:[],
    verifySummary:null, verifyPassed:false, verifyRanAt:null,
    rejections:{},
    lastSession:{ at:"2026-04-13T10:00:00Z", agent:"claude", event:"started", context:"init scaffold", files_touched:[] },
    events:[{ at:"2026-04-13T10:00:00Z", event:"started", phase:1 }],
    commitsPending:0, normalizeState:null,
    aitriVersion:"0.1.80", installedVersion:"0.1.80", versionMismatch:false,
    externalSignals:[],
    artifactTree:[
      { id:"j1", name:"01_REQUIREMENTS.json", phase:"1", status:"in_progress", size:"2.1 KB", updated:"5d ago" },
    ],
    commits:[{ hash:"f1a2b3", msg:"init: project scaffold", time:"5d" }],
  },
];

function timeAgo(iso) {
  if (!iso) return "never";
  const h = (Date.now()-new Date(iso))/36e5;
  if (h<1)  return `${Math.round(h*60)}m ago`;
  if (h<24) return `${Math.round(h)}h ago`;
  return `${Math.round(h/24)}d ago`;
}
function getWeight(health) {
  if (health.overall==="critical") return "large";
  if (health.overall==="at_risk")  return "medium";
  return "small";
}

// ── Jarvis visual atoms ───────────────────────────────────────────────────
function ArcGauge({ value, total, color, size=64, label, sub }) {
  const pct  = total>0?value/total:0;
  const r    = size/2-6;
  const circ = 2*Math.PI*r;
  const cx   = size/2, cy=size/2;
  const tipAngle = pct*2*Math.PI - Math.PI/2;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.muted} strokeWidth={3}/>
        {[0,0.25,0.5,0.75].map((t,i)=>{
          const a=t*2*Math.PI;
          return <line key={i}
            x1={cx+(r-5)*Math.cos(a)} y1={cy+(r-5)*Math.sin(a)}
            x2={cx+(r+1)*Math.cos(a)} y2={cy+(r+1)*Math.sin(a)}
            stroke={C.dim} strokeWidth={1}/>;
        })}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={`${circ*pct} ${circ}`} strokeLinecap="round"
          style={{ filter:`drop-shadow(0 0 4px ${color})`, transition:"stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)" }}/>
        {pct>0.02&&<circle
          cx={cx+r*Math.cos(tipAngle)} cy={cy+r*Math.sin(tipAngle)}
          r={3} fill={color} style={{ filter:`drop-shadow(0 0 4px ${color})` }}/>}
      </svg>
      <div style={{ textAlign:"center", marginTop:-4 }}>
        <div style={{ fontFamily:F, fontSize:"13px", color, fontWeight:700,
          textShadow:`0 0 8px ${color}` }}>{label}</div>
        {sub&&<div style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.1em" }}>{sub}</div>}
      </div>
    </div>
  );
}

function Ring({ size=120, color=C.cyan, speed=20, reverse }) {
  return (
    <svg width={size} height={size} style={{
      position:"absolute", top:"50%", left:"50%",
      transform:"translate(-50%,-50%)",
      animation:`${reverse?"ringRev":"ringFwd"} ${speed}s linear infinite`,
      pointerEvents:"none" }}>
      <circle cx={size/2} cy={size/2} r={size/2-2} fill="none"
        stroke={color} strokeWidth={0.5} opacity={0.4}
        strokeDasharray={`${size*0.08} ${size*0.08}`}/>
    </svg>
  );
}

function StatusDot({ color, critical }) {
  return (
    <span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%",
      background:color, boxShadow:`0 0 8px ${color}, 0 0 16px ${color}60, 0 0 24px ${color}30`,
      flexShrink:0,
      animation:critical?"critpulse 1.2s ease-in-out infinite":"none" }}/>
  );
}

function HUDBar({ value, total, color, h=3 }) {
  const pct = total>0?(value/total)*100:0;
  return (
    <div style={{ position:"relative", height:h, background:`${C.muted}80`, overflow:"hidden", flex:1 }}>
      <div style={{ position:"absolute", inset:0, width:`${pct}%`,
        background:`linear-gradient(90deg,${color}40,${color})`,
        boxShadow:`0 0 8px ${color}`,
        transition:"width 0.8s cubic-bezier(0.4,0,0.2,1)" }}/>
      <div style={{ position:"absolute", top:0, height:"100%", width:"20%",
        background:`linear-gradient(90deg,transparent,${color}80,transparent)`,
        animation:"barShimmer 2s ease-in-out infinite" }}/>
    </div>
  );
}

function PhaseBar({ progress, currentPhase, color, mini }) {
  return (
    <div style={{ display:"flex", gap:mini?2:3 }}>
      {PHASES_SHORT.map((p,i)=>{
        const done=i<progress, cur=i===currentPhase-1&&!done;
        return (
          <div key={p} style={{ flex:1 }}>
            <div style={{ height:mini?2:4,
              background:done?color:cur?`${color}35`:C.muted+"55",
              boxShadow:done?`0 0 6px ${color}`:cur?`0 0 3px ${color}40`:"none",
              transition:"all 0.5s" }}/>
            {!mini&&<div style={{ fontFamily:F, fontSize:"7px",
              color:done?color:cur?`${color}60`:C.muted,
              textAlign:"center", marginTop:2, letterSpacing:"0.04em" }}>{p}</div>}
          </div>
        );
      })}
    </div>
  );
}

function HealthTag({ health, small }) {
  const m = HEALTH_META[health.overall];
  return (
    <span style={{ fontFamily:F, fontSize:small?"8px":"9px", color:m.color,
      background:`${m.color}12`, border:`1px solid ${m.color}40`,
      padding:small?"2px 6px":"3px 8px", letterSpacing:"0.1em",
      boxShadow:`0 0 8px ${m.color}25` }}>
      {m.label}
    </span>
  );
}

function HUDBtn({ color, onClick, full, small, children }) {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ fontFamily:F, fontSize:small?"8px":"9px",
        color:h?C.bg:color, background:h?color:`${color}10`,
        border:`1px solid ${color}`, padding:small?"4px 10px":"6px 16px",
        cursor:"pointer", width:full?"100%":"auto",
        letterSpacing:"0.1em", transition:"all 0.15s",
        boxShadow:h?`0 0 20px ${color}60`:`0 0 8px ${color}20` }}>
      {children}
    </button>
  );
}

function Ticker() {
  const [t,setT]=useState(5);
  const [d,setD]=useState(0);
  useEffect(()=>{const i=setInterval(()=>{setT(v=>v<=0?5:v-1);setD(v=>(v+1)%4);},1000);return()=>clearInterval(i);},[]);
  return(
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ width:5, height:5, background:C.cyan, borderRadius:"50%",
        boxShadow:`0 0 6px ${C.cyan}`, animation:"tickpulse 1s ease-in-out infinite" }}/>
      <span style={{ fontFamily:F, fontSize:"8px", color:C.cyanDim, letterSpacing:"0.1em" }}>
        SYNC{".".repeat(d)} {t}s
      </span>
    </div>
  );
}

// ── MONITOR CARDS (Jarvis visual + health logic) ───────────────────────────
function CardLarge({ project, health, onOpen }) {
  const m  = HEALTH_META[health.overall];
  const tp = project.verifySummary
    ? Math.round((project.verifySummary.passed/project.verifySummary.total)*100) : null;

  // Count issues by dimension for the radar
  const dimCounts = {};
  health.issues.forEach(i=>{ dimCounts[i.dim]=(dimCounts[i.dim]||0)+1; });

  return (
    <div style={{ position:"relative", background:`linear-gradient(135deg,${C.layer2},${C.layer1})`,
      border:`1px solid ${m.color}30`,
      padding:"20px 22px", display:"flex", flexDirection:"column", gap:16,
      boxShadow:`0 0 40px ${m.glow}, 0 0 1px ${m.color}20, inset 0 0 60px rgba(0,0,0,0.5)`,
      transition:"box-shadow 0.3s" }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 0 60px ${m.glow},0 0 0 1px ${m.color}30`}
      onMouseLeave={e=>e.currentTarget.style.boxShadow=`0 0 40px ${m.glow},0 0 1px ${m.color}20,inset 0 0 60px rgba(0,0,0,0.5)`}>

      {/* Corner marks */}
      {[[0,"auto",0,"auto"],[0,"auto","auto",0],["auto",0,0,"auto"]].map(([t,b,r,l],i)=>
        <div key={i} style={{ position:"absolute",
          top:t!=="auto"?0:undefined, bottom:b!=="auto"?0:undefined,
          right:r!=="auto"?0:undefined, left:l!=="auto"?0:undefined,
          width:16, height:16,
          borderTop:   t!=="auto"?`2px solid ${m.color}60`:undefined,
          borderBottom:b!=="auto"?`2px solid ${m.color}40`:undefined,
          borderRight: r!=="auto"?`2px solid ${m.color}60`:undefined,
          borderLeft:  l!=="auto"?`2px solid ${m.color}60`:undefined }}/>
      )}

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <StatusDot color={m.color} critical={health.overall==="critical"}/>
            <span style={{ fontFamily:F, fontSize:"17px", color:C.text, fontWeight:700,
              letterSpacing:"0.02em", textShadow:`0 0 20px ${m.color}35` }}>
              {project.name}
            </span>
            <HealthTag health={health}/>
          </div>
          <span style={{ fontFamily:F, fontSize:"9px", color:C.dim, letterSpacing:"0.06em" }}>
            {project.description}
          </span>
        </div>
        <HUDBtn color={m.color} onClick={()=>onOpen(project.id)}>OPEN ›</HUDBtn>
      </div>

      {/* 2-col body */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.1fr", gap:18 }}>
        {/* Left: phase + dimension status */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <span style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.12em" }}>PIPELINE</span>
            <div style={{ marginTop:7 }}>
              <PhaseBar progress={project.approvedPhases.length}
                currentPhase={project.currentPhase} color={m.color}/>
            </div>
            <div style={{ fontFamily:F, fontSize:"8px", color:m.color, marginTop:5,
              letterSpacing:"0.06em" }}>
              ▸ PHASE {project.currentPhase}/5 · {timeAgo(project.lastSession?.at)} · {project.lastSession?.agent}
            </div>
          </div>

          {/* 5-dimension health grid */}
          <div>
            <span style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.12em" }}>HEALTH DIMENSIONS</span>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, marginTop:7 }}>
              {["pipeline","tests","code","artifacts","version"].map(dim => {
                const dimIssues = health.issues.filter(i=>i.dim===dim);
                const worst = dimIssues.some(i=>i.level==="critical")?"critical"
                            : dimIssues.some(i=>i.level==="warn")?"warn":"ok";
                const col = worst==="critical"?C.red:worst==="warn"?C.yellow:C.cyanDim;
                return (
                  <div key={dim} style={{ background:C.muted+"40",
                    border:`1px solid ${col}30`, borderTop:`1px solid ${col}60`,
                    padding:"6px 8px", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:5, height:5, borderRadius:"50%", background:col,
                      boxShadow:`0 0 5px ${col}`, display:"block", flexShrink:0 }}/>
                    <span style={{ fontFamily:F, fontSize:"8px", color:C.dim,
                      letterSpacing:"0.08em", flex:1 }}>{dim.toUpperCase()}</span>
                    {dimIssues.length>0 && (
                      <span style={{ fontFamily:F, fontSize:"8px", color:col }}>{dimIssues.length}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: gauges + key signals */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {tp!==null && (
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <ArcGauge value={project.verifySummary.passed} total={project.verifySummary.total}
                color={project.verifySummary.failed>0?C.red:C.green}
                size={64} label={`${tp}%`} sub="TESTS"/>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8 }}>
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.1em" }}>PASSING</span>
                    <span style={{ fontFamily:F, fontSize:"8px",
                      color:project.verifySummary.failed>0?C.red:C.cyanDim }}>
                      {project.verifySummary.passed}/{project.verifySummary.total}
                    </span>
                  </div>
                  <HUDBar value={project.verifySummary.passed} total={project.verifySummary.total} h={3}
                    color={project.verifySummary.failed>0?C.red:C.green}/>
                </div>
                {project.verifySummary.failed>0 && (
                  <div style={{ fontFamily:F, fontSize:"8px", color:C.red, letterSpacing:"0.06em" }}>
                    ✕ {project.verifySummary.failed} FAILING
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Key signals: compact grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
            {[
              { l:"VERIFY",  v:project.verifyPassed?"PASS":"FAIL",
                c:project.verifyPassed?C.cyanDim:C.red },
              { l:"DRIFT",   v:project.driftPhases?.length>0?"YES":"NO",
                c:project.driftPhases?.length>0?C.orange:C.cyanDim },
              { l:"PENDING", v:project.commitsPending||0,
                c:project.commitsPending>0?C.yellow:C.cyanDim },
              { l:"REJECTS", v:Object.keys(project.rejections||{}).length,
                c:Object.keys(project.rejections||{}).length>0?C.red:C.cyanDim },
              { l:"SIGNALS", v:project.externalSignals?.length||0,
                c:project.externalSignals?.length>0?C.yellow:C.cyanDim },
              { l:"VERSION", v:project.versionMismatch?"WARN":"OK",
                c:project.versionMismatch?C.yellow:C.cyanDim },
            ].map(({l,v,c})=>(
              <div key={l} style={{ background:C.muted+"40", border:`1px solid ${C.border}`,
                borderTop:`1px solid ${c}40`, padding:"7px 8px" }}>
                <div style={{ fontFamily:F, fontSize:"7px", color:C.dim,
                  letterSpacing:"0.1em", marginBottom:3 }}>{l}</div>
                <div style={{ fontFamily:F, fontSize:"12px", color:c, fontWeight:700,
                  textShadow:`0 0 8px ${c}` }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Top critical issue */}
          {health.issues.filter(i=>i.level==="critical")[0] && (
            <div style={{ background:`${C.red}08`, border:`1px solid ${C.red}30`,
              padding:"8px 10px" }}>
              <span style={{ fontFamily:F, fontSize:"8px", color:C.red, letterSpacing:"0.06em" }}>
                ✕ {health.issues.filter(i=>i.level==="critical")[0].msg}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CardMedium({ project, health, onOpen }) {
  const m  = HEALTH_META[health.overall];
  const tp = project.verifySummary
    ? Math.round((project.verifySummary.passed/project.verifySummary.total)*100) : null;

  return (
    <div style={{ position:"relative", background:`linear-gradient(135deg,${C.layer2},${C.layer1})`,
      border:`1px solid ${m.color}20`, borderLeft:`2px solid ${m.color}`,
      padding:"16px 18px", display:"flex", flexDirection:"column", gap:11,
      boxShadow:`0 0 24px ${m.glow}`, transition:"box-shadow 0.25s" }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 0 40px ${m.glow},0 0 0 1px ${m.color}20`}
      onMouseLeave={e=>e.currentTarget.style.boxShadow=`0 0 24px ${m.glow}`}>

      <div style={{ position:"absolute", top:0, right:0, width:16, height:16,
        borderTop:`1px solid ${m.color}50`, borderRight:`1px solid ${m.color}50` }}/>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
            <StatusDot color={m.color}/>
            <span style={{ fontFamily:F, fontSize:"14px", color:C.text, fontWeight:700,
              letterSpacing:"0.02em" }}>{project.name}</span>
          </div>
          <span style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.06em" }}>
            PHASE {project.currentPhase}/5 · {timeAgo(project.lastSession?.at)}
          </span>
        </div>
        <HealthTag health={health} small/>
      </div>

      <PhaseBar progress={project.approvedPhases.length}
        currentPhase={project.currentPhase} color={m.color}/>

      {/* Compact 6-signal grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5 }}>
        {[
          { l:"TESTS",   v:tp!==null?`${tp}%`:"N/A",
            c:project.verifySummary?.failed>0?C.red:tp!==null?C.cyanDim:C.dim },
          { l:"DRIFT",   v:project.driftPhases?.length>0?"YES":"NO",
            c:project.driftPhases?.length>0?C.orange:C.cyanDim },
          { l:"VERIFY",  v:project.verifyPassed?"PASS":"FAIL",
            c:project.verifyPassed?C.cyanDim:C.red },
          { l:"PENDING", v:project.commitsPending||0,
            c:project.commitsPending>0?C.yellow:C.cyanDim },
          { l:"SIGNALS", v:project.externalSignals?.length||0,
            c:project.externalSignals?.length>0?C.yellow:C.cyanDim },
          { l:"REJECTS", v:Object.keys(project.rejections||{}).length,
            c:Object.keys(project.rejections||{}).length>0?C.red:C.cyanDim },
        ].map(({l,v,c})=>(
          <div key={l} style={{ background:C.muted+"40", border:`1px solid ${C.border}`,
            borderTop:`1px solid ${c}35`, padding:"6px 8px" }}>
            <div style={{ fontFamily:F, fontSize:"7px", color:C.dim,
              letterSpacing:"0.1em", marginBottom:2 }}>{l}</div>
            <div style={{ fontFamily:F, fontSize:"12px", color:c, fontWeight:700 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Top issue — one line */}
      {health.issues.length>0 && (
        <div style={{ fontFamily:F, fontSize:"8px", letterSpacing:"0.04em",
          color:health.issues[0].level==="critical"?C.red:C.yellow,
          paddingLeft:10, borderLeft:`2px solid ${health.issues[0].level==="critical"?C.red:C.yellow}` }}>
          {health.issues[0].level==="critical"?"✕":"⚠"} {health.issues[0].msg}
          {health.issues.length>1 &&
            <span style={{ color:C.dim }}> +{health.issues.length-1}</span>}
        </div>
      )}

      <HUDBtn color={m.color} onClick={()=>onOpen(project.id)} full small>OPEN ›</HUDBtn>
    </div>
  );
}

function CardSmall({ project, health, onOpen }) {
  const m = HEALTH_META[health.overall];
  return (
    <div style={{ background:C.layer1, border:`1px solid ${C.border}`,
      borderLeft:`2px solid ${m.color}`, padding:"13px 15px",
      display:"flex", flexDirection:"column", gap:9,
      transition:"all 0.2s" }}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=`${m.color}35`;e.currentTarget.style.boxShadow=`0 0 16px ${m.glow}`;}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderLeftColor=m.color;}}>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <StatusDot color={m.color}/>
          <span style={{ fontFamily:F, fontSize:"12px", color:C.text, fontWeight:700,
            letterSpacing:"0.02em" }}>{project.name}</span>
        </div>
        <HealthTag health={health} small/>
      </div>

      <PhaseBar progress={project.approvedPhases.length}
        currentPhase={project.currentPhase} color={m.color} mini/>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4 }}>
        {[
          { l:"TST", v:project.verifySummary?`${Math.round((project.verifySummary.passed/project.verifySummary.total)*100)}%`:"—",
            c:project.verifySummary?.failed>0?C.red:C.cyanDim },
          { l:"DFT", v:project.driftPhases?.length>0?"Y":"N", c:project.driftPhases?.length>0?C.orange:C.cyanDim },
          { l:"SIG", v:project.externalSignals?.length||0, c:project.externalSignals?.length>0?C.yellow:C.cyanDim },
          { l:"REJ", v:Object.keys(project.rejections||{}).length, c:Object.keys(project.rejections||{}).length>0?C.red:C.cyanDim },
        ].map(({l,v,c})=>(
          <div key={l} style={{ background:C.muted+"40", border:`1px solid ${C.border}`, padding:"5px 6px" }}>
            <div style={{ fontFamily:F, fontSize:"7px", color:C.dim, letterSpacing:"0.1em" }}>{l}</div>
            <div style={{ fontFamily:F, fontSize:"11px", color:c, fontWeight:700 }}>{v}</div>
          </div>
        ))}
      </div>

      {health.issues.length>0 ? (
        <div style={{ fontFamily:F, fontSize:"8px",
          color:health.issues[0].level==="critical"?C.red:C.yellow, letterSpacing:"0.04em" }}>
          {health.issues[0].level==="critical"?"✕":"⚠"} {health.issues[0].msg.slice(0,60)}{health.issues[0].msg.length>60?"…":""}
        </div>
      ) : (
        <span style={{ fontFamily:F, fontSize:"8px", color:C.cyanDim, letterSpacing:"0.08em" }}>● NOMINAL</span>
      )}

      <button onClick={()=>onOpen(project.id)} style={{
        fontFamily:F, fontSize:"8px", color:C.dim, background:"transparent",
        border:`1px solid ${C.border}`, padding:"4px 0",
        cursor:"pointer", width:"100%", letterSpacing:"0.12em", transition:"all 0.15s" }}
        onMouseEnter={e=>{e.currentTarget.style.color=m.color;e.currentTarget.style.borderColor=`${m.color}50`;}}
        onMouseLeave={e=>{e.currentTarget.style.color=C.dim;e.currentTarget.style.borderColor=C.border;}}>
        OPEN ›
      </button>
    </div>
  );
}

// ── Radial summary ─────────────────────────────────────────────────────────
function RadialSummary({ projects }) {
  const withHealth = projects.map(p=>({p,h:computeHealth(p)}));
  const nominal = withHealth.filter(x=>x.h.overall==="healthy").length;
  const total   = projects.length;
  const issues  = total - nominal;
  const size    = 80, r = 30, circ = 2*Math.PI*r;
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <Ring size={size} color={C.cyan} speed={30}/>
      <Ring size={size-14} color={C.cyanDim} speed={20} reverse/>
      <svg width={size} height={size} style={{ position:"absolute", inset:0, transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.muted} strokeWidth={2.5}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={issues>0?C.red:C.green} strokeWidth={2.5}
          strokeDasharray={`${circ*(nominal/total)} ${circ}`} strokeLinecap="round"
          style={{ filter:`drop-shadow(0 0 4px ${issues>0?C.red:C.green})`, transition:"all 1s" }}/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontFamily:F, fontSize:"14px", color:issues>0?C.red:C.green, fontWeight:700,
          textShadow:`0 0 8px ${issues>0?C.red:C.green}` }}>{nominal}/{total}</span>
        <span style={{ fontFamily:F, fontSize:"7px", color:C.dim, letterSpacing:"0.08em" }}>NOMINAL</span>
      </div>
    </div>
  );
}

// ── MONITOR VIEW ───────────────────────────────────────────────────────────
function MonitorView({ onOpen }) {
  const [filter,setFilter]=useState("all");
  const [time,setTime]=useState(new Date());
  const [scanY,setScanY]=useState(0);

  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t);},[]);
  useEffect(()=>{let y=0;const t=setInterval(()=>{y=(y+0.4)%100;setScanY(y);},50);return()=>clearInterval(t);},[]);

  const withHealth = PROJECTS.map(p=>({project:p, health:computeHealth(p)}));
  const counts = { healthy:0, at_risk:0, critical:0 };
  withHealth.forEach(({health})=>counts[health.overall]++);
  const totalIssues = withHealth.reduce((s,{health})=>s+health.issues.length,0);

  const priority = { critical:0, at_risk:1, healthy:2 };
  let items = [...withHealth].sort((a,b)=>priority[a.health.overall]-priority[b.health.overall]);
  if (filter!=="all") items=items.filter(({health})=>health.overall===filter);

  return (
    <div style={{ background:C.bg, minHeight:"100vh", display:"flex", flexDirection:"column",
      position:"relative", overflow:"hidden" }}>

      {/* Scan line */}
      <div style={{ position:"fixed", left:0, right:0, height:2, zIndex:0, pointerEvents:"none",
        top:`${scanY}%`,
        background:`linear-gradient(90deg,transparent,${C.cyan}15,${C.cyan}30,${C.cyan}15,transparent)` }}/>

      {/* Grid */}
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none",
        backgroundImage:`linear-gradient(${C.cyanLine} 1px,transparent 1px),linear-gradient(90deg,${C.cyanLine} 1px,transparent 1px)`,
        backgroundSize:"60px 60px" }}/>

      {/* Topbar */}
      <div style={{ position:"sticky", top:0, zIndex:20,
        display:"flex", alignItems:"center", height:"54px", padding:"0 24px", gap:16,
        background:`linear-gradient(180deg,${C.layer2}F0,${C.bg}E0)`,
        backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.borderHi}` }}>

        {/* Logo */}
        <div style={{ position:"relative", width:44, height:44, flexShrink:0 }}>
          <Ring size={44} color={C.cyan} speed={12}/>
          <Ring size={32} color={C.cyanDim} speed={8} reverse/>
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ width:10, height:10, background:C.cyan,
              boxShadow:`0 0 10px ${C.cyan},0 0 20px ${C.cyan}60`,
              clipPath:"polygon(50% 0%,100% 50%,50% 100%,0% 50%)" }}/>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
          <span style={{ fontFamily:F, fontSize:"14px", color:C.text, fontWeight:700,
            letterSpacing:"0.08em", textShadow:`0 0 20px ${C.cyan}40` }}>AITRI HUB</span>
          <span style={{ fontFamily:F, fontSize:"7px", color:C.cyanDim, letterSpacing:"0.2em" }}>
            MISSION CONTROL v0.5
          </span>
        </div>

        <div style={{ width:1, height:28, background:C.borderHi }}/>
        <RadialSummary projects={PROJECTS}/>

        <div style={{ flex:1 }}/>

        {/* Health counts */}
        <div style={{ display:"flex", gap:12 }}>
          {counts.critical>0 && (
            <div style={{ display:"flex", alignItems:"center", gap:5,
              background:`${C.red}10`, border:`1px solid ${C.red}40`,
              padding:"3px 10px", animation:"alertBlink 2s ease-in-out infinite" }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:C.red,
                boxShadow:`0 0 5px ${C.red}`, display:"block" }}/>
              <span style={{ fontFamily:F, fontSize:"8px", color:C.red, letterSpacing:"0.1em" }}>
                {counts.critical} CRITICAL
              </span>
            </div>
          )}
          {counts.at_risk>0 && (
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:C.yellow, display:"block" }}/>
              <span style={{ fontFamily:F, fontSize:"8px", color:C.yellow, letterSpacing:"0.1em" }}>
                {counts.at_risk} AT RISK
              </span>
            </div>
          )}
          {counts.healthy>0 && (
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:C.cyanDim, display:"block" }}/>
              <span style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.1em" }}>
                {counts.healthy} NOMINAL
              </span>
            </div>
          )}
        </div>

        <div style={{ width:1, height:28, background:C.borderHi }}/>
        <Ticker/>
        <span style={{ fontFamily:F, fontSize:"9px", color:C.cyanDim, letterSpacing:"0.06em" }}>
          {time.toLocaleTimeString("en-US",{hour12:false})}
        </span>
      </div>

      {/* Filter bar */}
      <div style={{ position:"relative", zIndex:10,
        display:"flex", alignItems:"center", height:"34px", padding:"0 24px",
        background:C.layer1+"CC", backdropFilter:"blur(8px)",
        borderBottom:`1px solid ${C.border}` }}>
        <span style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.12em", marginRight:10 }}>FILTER</span>
        <div style={{ width:1, height:12, background:C.border, marginRight:0 }}/>
        {[
          { id:"all",      label:"ALL" },
          { id:"critical", label:"CRITICAL", color:C.red },
          { id:"at_risk",  label:"AT RISK",  color:C.yellow },
          { id:"healthy",  label:"NOMINAL",  color:C.cyanDim },
        ].map(f=>(
          <button key={f.id} onClick={()=>setFilter(f.id)} style={{
            fontFamily:F, fontSize:"8px",
            color:filter===f.id?(f.color||C.cyan):C.dim,
            background:"transparent", border:"none",
            borderBottom:`1px solid ${filter===f.id?(f.color||C.cyan):"transparent"}`,
            padding:"0 12px", height:"34px", cursor:"pointer",
            letterSpacing:"0.1em", transition:"all 0.15s",
            textShadow:filter===f.id?`0 0 8px ${f.color||C.cyan}`:"none" }}>{f.label}</button>
        ))}
        <div style={{ flex:1 }}/>
        <span style={{ fontFamily:F, fontSize:"8px", color:C.muted+"BB", letterSpacing:"0.08em" }}>
          {totalIssues} ISSUES · {items.length} PROJECTS
        </span>
      </div>

      {/* Bento grid */}
      <div style={{ flex:1, padding:"16px 24px", position:"relative", zIndex:10,
        display:"grid", gridTemplateColumns:"repeat(3,1fr)",
        gap:12, alignContent:"start", overflowY:"auto" }}>
        {items.map(({project,health},i)=>{
          const w=getWeight(health);
          return(
            <div key={project.id} style={{ gridColumn:w==="large"?"span 2":"span 1",
              animation:`fadeUp 0.3s ease ${i*0.06}s both` }}>
              {w==="large"  && <CardLarge  project={project} health={health} onOpen={onOpen}/>}
              {w==="medium" && <CardMedium project={project} health={health} onOpen={onOpen}/>}
              {w==="small"  && <CardSmall  project={project} health={health} onOpen={onOpen}/>}
            </div>
          );
        })}
      </div>

      <footer style={{ position:"relative", zIndex:10, padding:"5px 24px",
        borderTop:`1px solid ${C.border}`,
        background:C.layer2+"CC", display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.08em" }}>
          SYS:AITRI-HUB · DATA:LOCAL · ~/.aitri-hub/dashboard.json
        </span>
        <span style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.08em" }}>
          {items.length} NODES ACTIVE
        </span>
      </footer>
    </div>
  );
}

// ── DETAIL VIEW (glass version from health build) ─────────────────────────
const NAV = [
  { id:"overview",  label:"overview",  icon:"◈" },
  { id:"health",    label:"health",    icon:"♥" },
  { id:"artifacts", label:"artifacts", icon:"▣" },
  { id:"sessions",  label:"sessions",  icon:"◎" },
  { id:"alerts",    label:"alerts",    icon:"⚠" },
];

const Lbl = ({ children, color }) => (
  <span style={{ fontFamily:F, fontSize:"10px", color:color||"#4A6080", letterSpacing:"0.04em" }}>// {children}</span>
);

function GlassPanel({ label, children, color }) {
  const accent = color || C.cyan;
  return (
    <div style={{
      background: "rgba(2,13,26,0.85)",
      backdropFilter:"blur(20px)",
      border:`1px solid ${accent}18`,
      borderTop:`1px solid ${accent}45`,
      borderRadius:"10px",
      padding:"16px 18px", marginBottom:14,
      boxShadow:"inset 0 1px 0 rgba(0,212,255,0.05)" }}>
      {label && (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:13 }}>
          <div style={{ width:2, height:12, background:accent, boxShadow:`0 0 6px ${accent}` }}/>
          <Lbl color={accent}>{label}</Lbl>
        </div>
      )}
      {children}
    </div>
  );
}

function GlowBarDetail({ value, total, color, h=6 }) {
  const pct = total>0?(value/total)*100:0;
  return (
    <div style={{ height:h, background:"rgba(255,255,255,0.05)", borderRadius:"99px", overflow:"hidden" }}>
      <div style={{ width:`${pct}%`, height:"100%", borderRadius:"99px",
        background:`linear-gradient(90deg,${color}80,${color})`,
        boxShadow:`0 0 8px ${color}55`,
        transition:"width 0.7s cubic-bezier(0.4,0,0.2,1)" }}/>
    </div>
  );
}

function DetailView({ projectId, onBack }) {
  const project = PROJECTS.find(p=>p.id===projectId);
  const health  = computeHealth(project);
  const hm      = HEALTH_META[health.overall];
  const [section,setSection]=useState("overview");
  const [scanY,setScanY]=useState(0);

  useEffect(()=>{let y=0;const t=setInterval(()=>{y=(y+0.4)%100;setScanY(y);},50);return()=>clearInterval(t);},[]);

  return (
    <div style={{ background:C.bg, minHeight:"100vh", display:"flex", flexDirection:"column",
      position:"relative", overflow:"hidden" }}>

      <div style={{ position:"fixed", left:0, right:0, height:1, zIndex:0, pointerEvents:"none",
        top:`${scanY}%`, background:`linear-gradient(90deg,transparent,${C.cyan}15,transparent)` }}/>
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none",
        backgroundImage:`linear-gradient(${C.cyanLine} 1px,transparent 1px),linear-gradient(90deg,${C.cyanLine} 1px,transparent 1px)`,
        backgroundSize:"60px 60px" }}/>

      {/* Topbar */}
      <div style={{ position:"sticky", top:0, zIndex:20,
        display:"flex", alignItems:"center", height:"54px", padding:"0 24px", gap:10,
        background:`linear-gradient(180deg,${C.layer2}F0,${C.bg}E0)`,
        backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.borderHi}` }}>
        <span style={{ fontFamily:F, fontSize:"14px", color:C.text, fontWeight:700,
          letterSpacing:"0.08em" }}>AITRI HUB</span>
        <span style={{ fontFamily:F, fontSize:"10px", color:C.border }}>›</span>
        <span style={{ fontFamily:F, fontSize:"14px", color:hm.color, fontWeight:700,
          letterSpacing:"0.04em", textShadow:`0 0 16px ${hm.color}` }}>{project.name}</span>
        <span style={{ fontFamily:F, fontSize:"9px", color:C.dim, letterSpacing:"0.08em" }}>
          › {section}
        </span>
        <div style={{ flex:1 }}/>
        <HealthTag health={health}/>
        <Ticker/>
      </div>

      <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative", zIndex:10 }}>
        {/* Sidebar */}
        <div style={{ width:220, flexShrink:0,
          background:"rgba(2,13,26,0.85)", backdropFilter:"blur(16px)",
          borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column" }}>

          <button onClick={onBack} style={{ fontFamily:F, fontSize:"9px", color:C.dim,
            background:"transparent", border:"none",
            borderBottom:`1px solid ${C.border}`, padding:"11px 16px",
            cursor:"pointer", textAlign:"left", letterSpacing:"0.1em", transition:"color 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.color=C.cyan}
            onMouseLeave={e=>e.currentTarget.style.color=C.dim}>
            ‹ MISSION CONTROL
          </button>

          <div style={{ padding:"16px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
              <StatusDot color={hm.color} critical={health.overall==="critical"}/>
              <span style={{ fontFamily:F, fontSize:"13px", color:C.text, fontWeight:700 }}>
                {project.name}
              </span>
            </div>
            <HealthTag health={health} small/>
            <div style={{ fontFamily:F, fontSize:"9px", color:C.dim, marginTop:9, letterSpacing:"0.06em" }}>
              {project.branch}
            </div>
            <div style={{ fontFamily:F, fontSize:"8px", color:C.cyanDim, marginTop:3, letterSpacing:"0.08em" }}>
              {project.type==="remote"?"⌥ GITHUB":"⌥ LOCAL"}
            </div>
          </div>

          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}` }}>
            <span style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.12em" }}>PIPELINE</span>
            <div style={{ display:"flex", gap:3, margin:"8px 0 5px" }}>
              {PHASES_SHORT.map((_,i)=>(
                <div key={i} style={{ flex:1, height:"4px",
                  background:i<project.approvedPhases.length
                    ?`linear-gradient(90deg,${hm.color}70,${hm.color})`:"rgba(0,212,255,0.08)",
                  boxShadow:i<project.approvedPhases.length?`0 0 6px ${hm.color}45`:"none" }}/>
              ))}
            </div>
            <span style={{ fontFamily:F, fontSize:"9px", color:hm.color,
              filter:`drop-shadow(0 0 5px ${hm.color}70)` }}>
              PHASE {project.currentPhase}/5 · {timeAgo(project.lastSession?.at)}
            </span>
          </div>

          <div style={{ padding:"8px 0" }}>
            <div style={{ fontFamily:F, fontSize:"8px", color:C.dim,
              padding:"4px 16px 8px", letterSpacing:"0.12em" }}>SECTIONS</div>
            {NAV.map(item=>{
              const active=section===item.id;
              const badge = item.id==="health" ? health.issues.length
                          : item.id==="alerts" && project.externalSignals?.length>0
                            ? project.externalSignals.length : 0;
              return(
                <button key={item.id} onClick={()=>setSection(item.id)} style={{
                  fontFamily:F, fontSize:"9px",
                  color:active?hm.color:C.dim,
                  background:active?`${hm.color}08`:"transparent",
                  border:"none", borderLeft:`2px solid ${active?hm.color:"transparent"}`,
                  padding:"9px 16px", cursor:"pointer", width:"100%", textAlign:"left",
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  letterSpacing:"0.1em", transition:"all 0.15s",
                  textShadow:active?`0 0 8px ${hm.color}`:"none" }}
                  onMouseEnter={e=>{if(!active)e.currentTarget.style.color=C.text;}}
                  onMouseLeave={e=>{if(!active)e.currentTarget.style.color=C.dim;}}>
                  <span>{item.icon} {item.label.toUpperCase()}</span>
                  {badge>0&&<span style={{ fontFamily:F, fontSize:"8px",
                    color:item.id==="health"?(health.overall==="critical"?C.red:C.yellow):C.yellow,
                    background:"rgba(255,255,255,0.08)", padding:"1px 5px" }}>{badge}</span>}
                </button>
              );
            })}
          </div>

          <div style={{ flex:1 }}/>

          <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}` }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                { l:"ISSUES",  v:health.issues.length, c:health.issues.length>0?hm.color:C.dim },
                { l:"REJECTS", v:Object.keys(project.rejections||{}).length,
                  c:Object.keys(project.rejections||{}).length>0?C.red:C.dim },
                { l:"DRIFT",   v:project.driftPhases?.length>0?"YES":"NO",
                  c:project.driftPhases?.length>0?C.orange:C.dim },
                { l:"TESTS",   v:project.verifySummary?`${project.verifySummary.passed}/${project.verifySummary.total}`:"N/A",
                  c:C.dim },
              ].map(({l,v,c})=>(
                <div key={l}>
                  <div style={{ fontFamily:F, fontSize:"8px", color:C.dim, letterSpacing:"0.1em" }}>{l}</div>
                  <div style={{ fontFamily:F, fontSize:"13px", color:c, fontWeight:700,
                    filter:`drop-shadow(0 0 4px ${c}50)` }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, padding:"22px 26px", overflowY:"auto" }}>
          <div style={{ animation:"fadeUp 0.2s ease both" }}>
            {section==="overview"  && <OverviewSection  project={project} health={health}/>}
            {section==="health"    && <HealthSection    project={project} health={health}/>}
            {section==="artifacts" && <ArtifactsSection project={project}/>}
            {section==="sessions"  && <SessionsSection  project={project}/>}
            {section==="alerts"    && <AlertsSection    project={project} health={health}/>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail sections ────────────────────────────────────────────────────────
function OverviewSection({ project, health }) {
  const hm = HEALTH_META[health.overall];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <GlassPanel label="project" color={C.cyan}>
        <span style={{ fontFamily:F, fontSize:"12px", color:"#3A6080" }}>{project.description}</span>
        <div style={{ fontFamily:F, fontSize:"10px", color:"#0F2030", marginTop:6 }}>// {project.path}</div>
      </GlassPanel>

      <GlassPanel label="health_summary" color={hm.color}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
          <HealthTag health={health}/>
          <span style={{ fontFamily:F, fontSize:"11px", color:"#3A6080" }}>
            {health.issues.length} issue{health.issues.length!==1?"s":""} · {[...new Set(health.issues.map(i=>i.dim))].length} dimension{[...new Set(health.issues.map(i=>i.dim))].length!==1?"s":""}
          </span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          {health.issues.length===0 ? (
            <span style={{ fontFamily:F, fontSize:"10px", color:C.green }}>✓ All dimensions nominal</span>
          ) : health.issues.map((issue,i)=>{
            const col = issue.level==="critical"?C.red:C.yellow;
            return (
              <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
                <span style={{ color:col, fontSize:"10px", flexShrink:0 }}>
                  {issue.level==="critical"?"✕":"⚠"}
                </span>
                <span style={{ fontFamily:F, fontSize:"10px", color:col, lineHeight:1.5 }}>
                  <span style={{ color:"#3A6080", marginRight:5 }}>[{DIM_LABEL[issue.dim]}]</span>
                  {issue.msg}
                </span>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      <GlassPanel label="phase_pipeline">
        <div style={{ display:"flex", gap:5, marginBottom:10 }}>
          {["01_PLANNING","02_ARCHITECTURE","03_CODING","04_TESTING","05_DEPLOYMENT"].map((p,i)=>{
            const approved=project.approvedPhases.includes(i+1);
            const completed=project.completedPhases.includes(i+1);
            const current=project.currentPhase===i+1;
            const col=approved?C.green:completed?C.yellow:current?C.cyan:"#0F2030";
            return(
              <div key={p} style={{ flex:1 }}>
                <div style={{ height:6, borderRadius:"99px",
                  background:approved?`linear-gradient(90deg,${C.green}70,${C.green})`:completed?`${C.yellow}50`:current?`${C.cyan}30`:"rgba(0,212,255,0.06)",
                  boxShadow:approved?`0 0 8px ${C.green}45`:completed?`0 0 4px ${C.yellow}30`:"none" }}/>
                <div style={{ fontFamily:F, fontSize:"7px", color:col, textAlign:"center", marginTop:3,
                  letterSpacing:"0.04em" }}>{PHASES_SHORT[i]}</div>
                <div style={{ fontFamily:F, fontSize:"7px", color:"#0F2030", textAlign:"center" }}>
                  {approved?"✓ approved":completed?"pending":current?"active":"—"}
                </div>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {[
          { l:"last_session",    v:timeAgo(project.lastSession?.at), c:C.teal },
          { l:"agent",           v:project.lastSession?.agent||"—",  c:C.teal },
          { l:"branch",          v:project.branch,                   c:C.purple },
          { l:"verify_passed",   v:project.verifyPassed?"YES":"NO",
            c:project.verifyPassed?C.green:C.red },
          { l:"commits_pending", v:project.commitsPending||0,
            c:project.commitsPending>0?C.yellow:"#3A6080" },
          { l:"version",         v:project.versionMismatch?"MISMATCH":"OK",
            c:project.versionMismatch?C.yellow:"#3A6080" },
        ].map(({l,v,c})=>(
          <div key={l} style={{ background:"rgba(2,13,26,0.85)",
            backdropFilter:"blur(20px)",
            border:"1px solid rgba(0,212,255,0.12)",
            borderTop:"1px solid rgba(0,212,255,0.28)",
            borderRadius:"10px", padding:"12px 14px" }}>
            <Lbl>{l}</Lbl>
            <div style={{ fontFamily:F, fontSize:"14px", color:c, fontWeight:700, marginTop:6,
              filter:`drop-shadow(0 0 6px ${c}40)` }}>{String(v)}</div>
          </div>
        ))}
      </div>

      {project.verifySummary && (
        <GlassPanel label="test_telemetry">
          <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:10 }}>
            {[
              { l:"passing", v:project.verifySummary.passed,  c:C.green },
              { l:"failing", v:project.verifySummary.failed,  c:project.verifySummary.failed>0?C.red:"#3A6080" },
              { l:"skipped", v:project.verifySummary.skipped, c:"#0F2030" },
              { l:"total",   v:project.verifySummary.total,   c:"#3A6080" },
              { l:"last_run",v:timeAgo(project.verifyRanAt),  c:C.teal },
            ].map(({l,v,c})=>(
              <div key={l} style={{ textAlign:"center" }}>
                <div style={{ fontFamily:F, fontSize:"9px", color:"#0F2030", marginBottom:3 }}>{l}</div>
                <div style={{ fontFamily:F, fontSize:"16px", color:c, fontWeight:700,
                  filter:`drop-shadow(0 0 6px ${c}40)` }}>{v}</div>
              </div>
            ))}
          </div>
          <GlowBarDetail value={project.verifySummary.passed} total={project.verifySummary.total} h={6}
            color={project.verifySummary.failed>0?C.red:C.green}/>
        </GlassPanel>
      )}
    </div>
  );
}

function HealthSection({ project, health }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {["pipeline","tests","code","artifacts","version"].map(dim=>{
        const dimIssues=health.issues.filter(i=>i.dim===dim);
        const worst=dimIssues.some(i=>i.level==="critical")?"critical":dimIssues.some(i=>i.level==="warn")?"warn":"ok";
        const col=worst==="critical"?C.red:worst==="warn"?C.yellow:C.green;
        return(
          <div key={dim} style={{
            background:"rgba(2,13,26,0.85)", backdropFilter:"blur(20px)",
            border:`1px solid ${col}18`, borderTop:`2px solid ${col}`,
            borderRadius:"10px", padding:"14px 16px",
            boxShadow:`0 0 16px ${col}10` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:dimIssues.length>0?10:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ width:6, height:6, borderRadius:"50%", background:col,
                  boxShadow:`0 0 6px ${col}`, display:"block" }}/>
                <span style={{ fontFamily:F, fontSize:"12px", color:C.text, fontWeight:700,
                  letterSpacing:"0.04em" }}>{DIM_LABEL[dim].toUpperCase()}</span>
              </div>
              <span style={{ fontFamily:F, fontSize:"9px", color:col,
                background:`${col}15`, border:`1px solid ${col}35`,
                padding:"2px 7px", letterSpacing:"0.08em" }}>
                {worst==="ok"?"OK":worst==="warn"?"WARN":"CRITICAL"}
              </span>
            </div>
            {dimIssues.length>0?(
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {dimIssues.map((issue,i)=>(
                  <div key={i} style={{ fontFamily:F, fontSize:"11px",
                    color:issue.level==="critical"?C.red:C.yellow,
                    lineHeight:1.6, paddingLeft:14,
                    borderLeft:`2px solid ${issue.level==="critical"?C.red:C.yellow}40` }}>
                    {issue.msg}
                  </div>
                ))}
              </div>
            ):(
              <div style={{ fontFamily:F, fontSize:"10px", color:"#3A6080", paddingLeft:14 }}>
                All checks passing
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ArtifactsSection({ project }) {
  const [openFolders,setOpenFolders]=useState({});
  const [selected,setSelected]=useState(null);
  const byPhase=project.artifactTree.reduce((acc,f)=>{const ph=f.phase||"?";if(!acc[ph])acc[ph]=[];acc[ph].push(f);return acc;},{});
  const selectedFile=selected?project.artifactTree.find(f=>f.id===selected):null;

  return(
    <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:12, minHeight:420 }}>
      <div style={{ background:"rgba(2,13,26,0.85)", backdropFilter:"blur(20px)",
        border:"1px solid rgba(0,212,255,0.12)", borderTop:"1px solid rgba(0,212,255,0.28)",
        borderRadius:"10px", overflow:"hidden", display:"flex", flexDirection:"column" }}>
        <div style={{ fontFamily:F, fontSize:"9px", color:C.cyanDim,
          padding:"10px 14px", borderBottom:"1px solid rgba(0,212,255,0.1)",
          letterSpacing:"0.08em" }}>
          FILE TREE · {project.artifactTree.length} FILES
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {Object.entries(byPhase).map(([phase,files])=>{
            const isOpen=openFolders[phase]!==false;
            const statuses=files.map(f=>f.status);
            const hasErr=statuses.includes("rejected");
            const hasPend=statuses.includes("pending_approval");
            const allOk=statuses.every(s=>s==="approved");
            const fCol=hasErr?C.red:hasPend?C.yellow:allOk?C.green:C.dim;
            return(
              <div key={phase}>
                <div onClick={()=>setOpenFolders(p=>({...p,[phase]:!isOpen}))}
                  style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 14px",
                    cursor:"pointer", borderBottom:"1px solid rgba(0,212,255,0.04)",
                    transition:"background 0.12s" }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(0,212,255,0.03)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{ color:C.cyan, fontFamily:F, fontSize:"9px" }}>{isOpen?"▾":"▸"}</span>
                  <span style={{ fontFamily:F, fontSize:"9px", color:C.dim,
                    letterSpacing:"0.08em", flex:1 }}>PHASE_{phase}</span>
                  <span style={{ color:fCol, fontSize:"9px",
                    textShadow:`0 0 4px ${fCol}` }}>{hasErr?"✕":hasPend?"○":allOk?"✓":"·"}</span>
                </div>
                {isOpen&&files.map(file=>{
                  const fc=ARTIFACT_COL[file.status]||"#0F2030";
                  const sel=selected===file.id;
                  return(
                    <div key={file.id} onClick={()=>setSelected(sel?null:file.id)}
                      style={{ display:"flex", alignItems:"center", gap:7,
                        padding:"7px 14px 7px 26px", cursor:"pointer",
                        background:sel?`${fc}08`:"transparent",
                        borderLeft:`2px solid ${sel?fc:"transparent"}`,
                        transition:"all 0.12s" }}
                      onMouseEnter={e=>{if(!sel)e.currentTarget.style.background="rgba(0,212,255,0.025)";}}
                      onMouseLeave={e=>{if(!sel)e.currentTarget.style.background="transparent";}}>
                      <span style={{ color:fc, fontSize:"8px" }}>▣</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:F, fontSize:"9px", color:sel?fc:C.text,
                          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                          letterSpacing:"0.04em" }}>{file.name}</div>
                        <div style={{ fontFamily:F, fontSize:"8px", color:"#0F2030" }}>
                          {file.size} · {file.updated}
                        </div>
                      </div>
                      <span style={{ fontFamily:F, fontSize:"7px", color:fc,
                        background:`${fc}15`, border:`1px solid ${fc}35`,
                        padding:"1px 4px", flexShrink:0, letterSpacing:"0.06em" }}>
                        {file.status.replace("_"," ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ background:"rgba(2,13,26,0.85)", backdropFilter:"blur(20px)",
        border:"1px solid rgba(0,212,255,0.12)", borderTop:"1px solid rgba(0,212,255,0.28)",
        borderRadius:"10px", display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {selectedFile?(
          <>
            <div style={{ padding:"10px 16px", borderBottom:"1px solid rgba(0,212,255,0.1)",
              background:"rgba(0,212,255,0.02)",
              display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ color:ARTIFACT_COL[selectedFile.status], fontSize:"9px" }}>▣</span>
                <span style={{ fontFamily:F, fontSize:"10px", color:C.text,
                  letterSpacing:"0.04em" }}>{selectedFile.name}</span>
                <span style={{ fontFamily:F, fontSize:"8px",
                  color:ARTIFACT_COL[selectedFile.status],
                  background:`${ARTIFACT_COL[selectedFile.status]}15`,
                  border:`1px solid ${ARTIFACT_COL[selectedFile.status]}35`,
                  padding:"1px 5px", letterSpacing:"0.06em" }}>
                  {selectedFile.status.replace("_"," ")}
                </span>
              </div>
              <span style={{ fontFamily:F, fontSize:"9px", color:"#3A6080" }}>
                {selectedFile.size} · {selectedFile.updated}
              </span>
            </div>
            <div style={{ flex:1, padding:"16px 18px", overflowY:"auto",
              fontFamily:F, fontSize:"11px", lineHeight:1.9, color:"#3A6080" }}>
              <ArtifactContent file={selectedFile} project={project}/>
            </div>
          </>
        ):(
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
            flexDirection:"column", gap:10 }}>
            <div style={{ position:"relative", width:60, height:60 }}>
              <Ring size={60} color={C.cyan} speed={8}/>
              <Ring size={44} color={C.cyanDim} speed={5} reverse/>
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ color:C.dim, fontFamily:F, fontSize:"18px" }}>▣</span>
              </div>
            </div>
            <span style={{ fontFamily:F, fontSize:"9px", color:C.dim, letterSpacing:"0.1em" }}>
              SELECT A FILE TO INSPECT
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ArtifactContent({ file, project }) {
  const L=({c,children})=><div style={{color:c,marginBottom:2}}>{children}</div>;
  const S=()=><div style={{height:10}}/>;
  if(file.status==="approved") return(<>
    <L c={C.dim}># {file.name}</L><S/>
    <L c={C.dim}>STATUS</L><L c={C.green}>✓ Approved · {file.updated}</L><S/>
    <L c={C.dim}>VERIFICATION</L>
    <L c={C.green}>✓ Schema valid</L>
    <L c={C.green}>✓ Spec alignment confirmed</L>
    <L c={C.green}>✓ QA persona sign-off</L>
  </>);
  if(file.status==="pending_approval") return(<>
    <L c={C.dim}># {file.name}</L><S/>
    <L c={C.dim}>STATUS</L><L c={C.yellow}>○ Completed — awaiting human approval · {file.updated}</L><S/>
    <L c={C.dim}>NEXT STEP</L>
    <L c={"#3A6080"}>Run `aitri approve {file.phase}` to approve</L>
    <L c={"#3A6080"}>or `aitri reject {file.phase} --feedback "..."` to reject</L>
  </>);
  if(file.status==="rejected"){
    const rej=(project.rejections||{})[file.phase];
    return(<>
      <L c={C.dim}># {file.name}</L><S/>
      <L c={C.dim}>STATUS</L><L c={C.red}>✕ Rejected · {file.updated}</L><S/>
      {rej&&(<><L c={C.dim}>REJECTION FEEDBACK</L><L c={"#3A6080"}>{rej.feedback}</L><S/></>)}
      <L c={C.dim}>NEXT STEPS</L>
      <L c={C.yellow}>→ Address feedback and re-run phase {file.phase}</L>
    </>);
  }
  if(file.status==="in_progress") return(<>
    <L c={C.dim}># {file.name}</L><S/>
    <L c={C.dim}>STATUS</L><L c={C.cyan}>◎ In progress · {file.updated}</L><S/>
    <L c={"#3A6080"}>Run `aitri complete {file.phase}` when done.</L>
  </>);
  return(<><L c={C.dim}># {file.name}</L><S/><L c={"#0F2030"}>{file.status} · {file.updated}</L></>);
}

function SessionsSection({ project }) {
  return(
    <GlassPanel label={`session_log · ${project.events.length} events`} color={C.cyan}>
      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
        {[...project.events].reverse().map((ev,i)=>{
          const col=ev.event==="rejected"?C.red:ev.event==="approved"?C.green:ev.event==="completed"?C.yellow:"#3A6080";
          return(
            <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start",
              padding:"10px 12px",
              background:i===0?"rgba(0,212,255,0.04)":"transparent",
              borderLeft:`2px solid ${i===0?C.cyan:"rgba(0,212,255,0.08)"}` }}>
              <span style={{ fontFamily:F, fontSize:"9px", color:"#0F2030", flexShrink:0, marginTop:1 }}>
                {timeAgo(ev.at)}
              </span>
              <span style={{ fontFamily:F, fontSize:"10px", color:col, flexShrink:0 }}>
                {ev.event==="approved"?"✓":ev.event==="rejected"?"✕":ev.event==="completed"?"◉":"·"}
              </span>
              <span style={{ fontFamily:F, fontSize:"10px", color:C.text, flex:1 }}>
                <span style={{ color:col }}>{ev.event}</span>
                {ev.phase&&<span style={{ color:"#0F2030" }}> phase {ev.phase}</span>}
                {ev.feedback&&<span style={{ color:C.red, display:"block", fontSize:"9px", marginTop:3 }}>"{ev.feedback}"</span>}
              </span>
            </div>
          );
        })}
      </div>
      {project.lastSession?.context&&(
        <div style={{ marginTop:14, padding:"10px 12px",
          background:"rgba(0,212,255,0.03)", borderRadius:"8px",
          borderLeft:`2px solid ${C.teal}` }}>
          <Lbl color={C.teal}>last_session_context</Lbl>
          <div style={{ fontFamily:F, fontSize:"11px", color:"#3A6080", marginTop:6, lineHeight:1.6 }}>
            {project.lastSession.context}
          </div>
          {project.lastSession.files_touched?.length>0&&(
            <div style={{ marginTop:6 }}>
              <Lbl>files_touched</Lbl>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
                {project.lastSession.files_touched.map(f=>(
                  <span key={f} style={{ fontFamily:F, fontSize:"9px", color:C.purple,
                    background:`${C.purple}10`, border:`1px solid ${C.purple}30`,
                    borderRadius:"4px", padding:"1px 6px" }}>{f}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  );
}

function AlertsSection({ project, health }) {
  const allIssues=health.issues;
  const ext=project.externalSignals||[];
  if(allIssues.length===0&&ext.length===0) return(
    <GlassPanel label="alerts" color={C.green}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"20px 0" }}>
        <div style={{ position:"relative", width:40, height:40 }}>
          <Ring size={40} color={C.green} speed={6}/>
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ color:C.green, fontSize:"14px", textShadow:`0 0 8px ${C.green}` }}>●</span>
          </div>
        </div>
        <span style={{ fontFamily:F, fontSize:"12px", color:C.green, letterSpacing:"0.1em" }}>
          ALL SYSTEMS NOMINAL
        </span>
      </div>
    </GlassPanel>
  );
  return(
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {allIssues.map((issue,i)=>{
        const col=issue.level==="critical"?C.red:C.yellow;
        return(
          <div key={i} style={{
            background:"rgba(2,13,26,0.85)", backdropFilter:"blur(20px)",
            border:`1px solid ${col}18`, borderTop:`2px solid ${col}`,
            borderRadius:"10px", padding:"14px 16px",
            boxShadow:`0 0 16px ${col}10` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <span style={{ color:col, fontSize:"13px", filter:`drop-shadow(0 0 5px ${col})` }}>
                {issue.level==="critical"?"✕":"⚠"}
              </span>
              <span style={{ fontFamily:F, fontSize:"9px", color:col,
                background:`${col}15`, border:`1px solid ${col}35`,
                padding:"2px 7px", letterSpacing:"0.1em" }}>
                {DIM_LABEL[issue.dim].toUpperCase()}
              </span>
              <span style={{ fontFamily:F, fontSize:"9px", color:C.dim, letterSpacing:"0.08em" }}>
                {issue.level.toUpperCase()}
              </span>
            </div>
            <div style={{ fontFamily:F, fontSize:"11px", color:"#3A6080", lineHeight:1.7,
              background:"rgba(0,0,0,0.3)", padding:"10px 12px", borderRadius:"6px" }}>
              {issue.msg}
            </div>
          </div>
        );
      })}
      {ext.map((s,i)=>{
        const col=s.severity==="error"||s.severity==="blocking"?C.red:C.yellow;
        return(
          <div key={`ext-${i}`} style={{
            background:"rgba(2,13,26,0.85)", backdropFilter:"blur(20px)",
            border:`1px solid ${col}18`, borderTop:`2px solid ${col}`,
            borderRadius:"10px", padding:"14px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <span style={{ color:col, fontSize:"13px" }}>{s.severity==="error"?"✕":"⚠"}</span>
              <span style={{ fontFamily:F, fontSize:"9px", color:col,
                background:`${col}15`, border:`1px solid ${col}35`,
                padding:"2px 7px", letterSpacing:"0.1em" }}>{s.tool.toUpperCase()}</span>
              <span style={{ fontFamily:F, fontSize:"9px", color:C.dim, letterSpacing:"0.06em" }}>
                {s.type} · {s.severity}
              </span>
            </div>
            <div style={{ fontFamily:F, fontSize:"11px", color:"#3A6080", lineHeight:1.7,
              background:"rgba(0,0,0,0.3)", padding:"10px 12px", borderRadius:"6px" }}>
              {s.message}
              {s.command&&<div style={{ marginTop:6, color:C.purple }}>→ {s.command}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function AitriHubFinal() {
  const [view,setView]             = useState("monitor");
  const [selectedId,setSelectedId] = useState(null);
  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#010810;}
        @keyframes fadeUp    {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes critpulse {0%,100%{opacity:1}50%{opacity:0.15}}
        @keyframes tickpulse {0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes alertBlink{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes barShimmer{0%{left:-20%}100%{left:120%}}
        @keyframes ringFwd   {from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}
        @keyframes ringRev   {from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(-360deg)}}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(0,212,255,0.2)}
      `}</style>
      {view==="monitor"&&<MonitorView onOpen={id=>{setSelectedId(id);setView("detail");}}/>}
      {view==="detail"&&<DetailView  projectId={selectedId} onBack={()=>{setView("monitor");setSelectedId(null);}}/>}
    </>
  );
}
