import { useState, useEffect } from "react";

// ─── Design tokens ─────────────────────────────────────────────────────────
const F = "'JetBrains Mono', 'Courier New', monospace";
const C = {
  bg: "#0D1117", surface: "#161B22", surface2: "#21262D",
  surfaceRaised: "#2D333B", border: "#30363D",
  text: "#E6EDF3", dim: "#8B949E", muted: "#484F58",
  green: "#3FB950", blue: "#79C0FF", purple: "#D2A8FF",
  orange: "#FFA657", red: "#F85149", yellow: "#E3B341",
  teal: "#39C5CF", comment: "#6E7681",
};
const SC = { healthy: C.green, warning: C.yellow, error: C.red, stalled: C.comment };
const PHASES = ["01_PLANNING","02_ARCHITECTURE","03_CODING","04_TESTING","05_DEPLOYMENT"];
const PHASES_SHORT = ["PLAN","ARCH","CODE","TEST","DEPLOY"];
const ALERT_META = {
  stale_commits:  { label:"stale_commits",  color:C.yellow, icon:"⚠", desc:"No commits in 72+ hours. Check if blocked or deprioritized." },
  verify_failed:  { label:"verify_failed",  color:C.red,    icon:"✗", desc:"Verify phase failed. Run `aitri verify` for detailed output." },
  artifact_drift: { label:"artifact_drift", color:C.orange, icon:"~", desc:"Implementation diverged from approved spec. Update artifacts and re-run verify." },
  vuln_deps:      { label:"vuln_deps",      color:C.red,    icon:"✗", desc:"Vulnerable dependencies. Run `npm audit` and update flagged packages." },
};
const ARTIFACT_COL = { approved:"#3FB950", in_progress:"#79C0FF", drift:"#FFA657", rejected:"#F85149", pending:"#484F58" };

// ─── Mock data ─────────────────────────────────────────────────────────────
const PROJECTS = [
  {
    id:"ecommerce-api", name:"ecommerce-api", status:"error",
    phase:"02_ARCHITECTURE", phaseIdx:1, progress:2,
    lastCommit:"4d ago", commitVelocity:2, branch:"main",
    testsPassing:12, testsTotal:45, coverage:28,
    alerts:["stale_commits","verify_failed"], verifyStatus:"FAILED", artifacts:"clean",
    path:"~/projects/ecommerce-api", type:"local",
    description:"E-commerce REST API with inventory management",
    approvedPhases:["01_PLANNING"], rejections:3,
    artifactTree:[
      { id:"f1", name:"01_PLANNING", type:"folder", phase:"01_PLANNING", children:[
        { id:"f1a", name:"01_SPEC.md",           type:"file", status:"approved",     size:"5.6 KB", updated:"8d ago",  phase:"01_PLANNING" },
        { id:"f1b", name:"01_BUSINESS_RULES.md", type:"file", status:"approved",     size:"2.1 KB", updated:"8d ago",  phase:"01_PLANNING" },
      ]},
      { id:"f2", name:"02_ARCHITECTURE", type:"folder", phase:"02_ARCHITECTURE", children:[
        { id:"f2a", name:"02_ARCHITECTURE.json",  type:"file", status:"rejected",    size:"11.2 KB", updated:"4d ago", phase:"02_ARCHITECTURE" },
        { id:"f2b", name:"02_DIAGRAMS.md",        type:"file", status:"rejected",    size:"3.4 KB",  updated:"4d ago", phase:"02_ARCHITECTURE" },
      ]},
    ],
    commits:[
      { hash:"c3d1b8", msg:"chore: update dependencies",   time:"4d ago" },
      { hash:"b8f2a1", msg:"fix: broken route handler",    time:"6d ago" },
      { hash:"a1c9d3", msg:"feat: inventory sync service", time:"7d ago" },
    ],
  },
  {
    id:"aitri-hub", name:"aitri-hub", status:"warning",
    phase:"03_CODING", phaseIdx:2, progress:3,
    lastCommit:"18h ago", commitVelocity:7, branch:"feat/web-dashboard",
    testsPassing:41, testsTotal:60, coverage:62,
    alerts:["artifact_drift"], verifyStatus:"PASSED", artifacts:"drift_detected",
    path:"github/cesareyeserrano/aitri-hub", type:"remote",
    description:"Centralized dashboard for all Aitri-managed projects",
    approvedPhases:["01_PLANNING","02_ARCHITECTURE"], rejections:1,
    artifactTree:[
      { id:"g1", name:"01_PLANNING", type:"folder", phase:"01_PLANNING", children:[
        { id:"g1a", name:"01_SPEC.md",        type:"file", status:"approved", size:"3.1 KB", updated:"5d ago", phase:"01_PLANNING" },
        { id:"g1b", name:"01_IDEA.md",        type:"file", status:"approved", size:"1.8 KB", updated:"5d ago", phase:"01_PLANNING" },
      ]},
      { id:"g2", name:"02_ARCHITECTURE", type:"folder", phase:"02_ARCHITECTURE", children:[
        { id:"g2a", name:"02_ARCHITECTURE.json", type:"file", status:"approved", size:"9.4 KB", updated:"4d ago", phase:"02_ARCHITECTURE" },
      ]},
      { id:"g3", name:"03_CODING", type:"folder", phase:"03_CODING", children:[
        { id:"g3a", name:"03_IMPLEMENTATION.md", type:"file", status:"drift",    size:"7.8 KB", updated:"18h ago", phase:"03_CODING" },
        { id:"g3b", name:"03_COMPONENTS.md",     type:"file", status:"drift",    size:"4.2 KB", updated:"18h ago", phase:"03_CODING" },
      ]},
    ],
    commits:[
      { hash:"f2c1a9", msg:"wip: web dashboard React skeleton",     time:"18h ago" },
      { hash:"e9b3d4", msg:"fix: collector timeout on remote repos", time:"2d ago" },
      { hash:"d4a7c2", msg:"feat: add alerts engine",               time:"3d ago" },
    ],
  },
  {
    id:"finance-app", name:"finance-app", status:"healthy",
    phase:"04_TESTING", phaseIdx:3, progress:4,
    lastCommit:"2h ago", commitVelocity:18, branch:"main",
    testsPassing:89, testsTotal:92, coverage:87,
    alerts:[], verifyStatus:"PASSED", artifacts:"clean",
    path:"~/projects/finance-app", type:"local",
    description:"Personal finance tracker — Colombia/COP, mobile-first",
    approvedPhases:["01_PLANNING","02_ARCHITECTURE","03_CODING","04_TESTING"], rejections:0,
    artifactTree:[
      { id:"h1", name:"01_PLANNING", type:"folder", phase:"01_PLANNING", children:[
        { id:"h1a", name:"01_SPEC.md", type:"file", status:"approved", size:"4.2 KB", updated:"3d ago", phase:"01_PLANNING" },
      ]},
      { id:"h2", name:"02_ARCHITECTURE", type:"folder", phase:"02_ARCHITECTURE", children:[
        { id:"h2a", name:"02_ARCHITECTURE.json", type:"file", status:"approved", size:"8.7 KB", updated:"2d ago", phase:"02_ARCHITECTURE" },
        { id:"h2b", name:"02_API_CONTRACTS.md",  type:"file", status:"approved", size:"5.1 KB", updated:"2d ago", phase:"02_ARCHITECTURE" },
      ]},
      { id:"h3", name:"03_CODING", type:"folder", phase:"03_CODING", children:[
        { id:"h3a", name:"03_IMPLEMENTATION.md", type:"file", status:"approved", size:"12.1 KB", updated:"1d ago", phase:"03_CODING" },
      ]},
      { id:"h4", name:"04_TESTING", type:"folder", phase:"04_TESTING", children:[
        { id:"h4a", name:"04_TEST_RESULTS.json", type:"file", status:"in_progress", size:"6.3 KB", updated:"2h ago", phase:"04_TESTING" },
        { id:"h4b", name:"04_TEST_PLAN.md",      type:"file", status:"approved",    size:"3.8 KB", updated:"1d ago", phase:"04_TESTING" },
      ]},
    ],
    commits:[
      { hash:"a3f9c1", msg:"fix: edge case in COP currency formatter", time:"2h ago" },
      { hash:"b1e4d2", msg:"feat: add budget projection chart",        time:"6h ago" },
      { hash:"c9a2f3", msg:"test: unit tests for expense parser",      time:"1d ago" },
      { hash:"d5b8e1", msg:"refactor: split finance service",          time:"2d ago" },
    ],
  },
  {
    id:"cesareyes-ai", name:"cesareyes.ai", status:"healthy",
    phase:"05_DEPLOYMENT", phaseIdx:4, progress:5,
    lastCommit:"30m ago", commitVelocity:24, branch:"main",
    testsPassing:120, testsTotal:120, coverage:94,
    alerts:[], verifyStatus:"PASSED", artifacts:"clean",
    path:"github/cesareyeserrano/cesareyes-ai", type:"remote",
    description:"Conversational AI digital twin — RAG-powered",
    approvedPhases:["01_PLANNING","02_ARCHITECTURE","03_CODING","04_TESTING","05_DEPLOYMENT"], rejections:0,
    artifactTree:[
      { id:"i1", name:"01_PLANNING",     type:"folder", phase:"01_PLANNING",     children:[{ id:"i1a", name:"01_SPEC.md",        type:"file", status:"approved", size:"6.8 KB",  updated:"14d ago", phase:"01_PLANNING" }] },
      { id:"i2", name:"02_ARCHITECTURE", type:"folder", phase:"02_ARCHITECTURE", children:[{ id:"i2a", name:"02_ARCHITECTURE.json",type:"file", status:"approved", size:"14.3 KB", updated:"10d ago", phase:"02_ARCHITECTURE" }] },
      { id:"i3", name:"03_CODING",       type:"folder", phase:"03_CODING",       children:[{ id:"i3a", name:"03_IMPLEMENTATION.md",type:"file", status:"approved", size:"18.2 KB", updated:"7d ago",  phase:"03_CODING" }] },
      { id:"i4", name:"04_TESTING",      type:"folder", phase:"04_TESTING",      children:[{ id:"i4a", name:"04_TEST_RESULTS.json",type:"file", status:"approved", size:"9.1 KB",  updated:"3d ago",  phase:"04_TESTING" }] },
      { id:"i5", name:"05_DEPLOYMENT",   type:"folder", phase:"05_DEPLOYMENT",   children:[{ id:"i5a", name:"05_DEPLOYMENT.md",    type:"file", status:"approved", size:"4.5 KB",  updated:"30m ago", phase:"05_DEPLOYMENT" }] },
    ],
    commits:[
      { hash:"a1b2c3", msg:"deploy: v1.2.0 — RAG confidence scoring",     time:"30m ago" },
      { hash:"b3c4d5", msg:"feat: synthetic response delay tuning",        time:"3h ago" },
      { hash:"c5d6e7", msg:"fix: forbidden phrases edge case",             time:"1d ago" },
    ],
  },
  {
    id:"aitri-spec", name:"aitri-spec", status:"stalled",
    phase:"01_PLANNING", phaseIdx:0, progress:1,
    lastCommit:"5d ago", commitVelocity:1, branch:"main",
    testsPassing:0, testsTotal:0, coverage:0,
    alerts:["stale_commits"], verifyStatus:"PENDING", artifacts:"clean",
    path:"~/projects/aitri-spec", type:"local",
    description:"Intelligent spec orchestrator — atomic feature contracts",
    approvedPhases:[], rejections:0,
    artifactTree:[
      { id:"j1", name:"01_PLANNING", type:"folder", phase:"01_PLANNING", children:[
        { id:"j1a", name:"01_SPEC.md", type:"file", status:"pending", size:"2.1 KB", updated:"5d ago", phase:"01_PLANNING" },
      ]},
    ],
    commits:[
      { hash:"f1a2b3", msg:"init: project scaffold", time:"5d ago" },
    ],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────
function getWeight(p) {
  if (p.status==="error") return "large";
  if (p.status==="warning") return "medium";
  if (p.progress>=4) return "medium";
  return "small";
}

// ─── Atoms ─────────────────────────────────────────────────────────────────
const Lbl = ({c,children}) => (
  <span style={{fontFamily:F,fontSize:"10px",color:c||C.comment}}>// {children}</span>
);
const Badge = ({status,small}) => {
  const col=SC[status]||C.comment;
  return <span style={{fontFamily:F,fontSize:small?"10px":"11px",color:col,
    border:`1px solid ${col}55`,borderRadius:"2px",padding:"1px 6px",letterSpacing:"0.04em"}}>
    [{status.toUpperCase()}]
  </span>;
};
const MiniBar = ({value,total,color,h=3}) => {
  const pct=total>0?(value/total)*100:0;
  return <div style={{height:h,background:C.surface2,borderRadius:"1px",overflow:"hidden",flex:1}}>
    <div style={{width:`${pct}%`,height:"100%",background:color,transition:"width 0.5s ease"}}/>
  </div>;
};
const PhaseTrack = ({progress,phaseIdx,color,compact}) => (
  <div>
    <div style={{display:"flex",gap:"3px",marginBottom:compact?"0":"4px"}}>
      {PHASES_SHORT.map((p,i)=>(
        <div key={p} title={PHASES[i]} style={{flex:1,height:compact?"3px":"4px",borderRadius:"1px",
          background:i<progress?color:C.surface2,transition:"background 0.3s ease"}}/>
      ))}
    </div>
    {!compact&&<div style={{display:"flex",justifyContent:"space-between"}}>
      {PHASES_SHORT.map((p,i)=>(
        <span key={p} style={{fontFamily:F,fontSize:"8px",
          color:i<progress?color:i===phaseIdx?C.blue:C.muted}}>{p}</span>
      ))}
    </div>}
  </div>
);
const AlertChip = ({type,small}) => {
  const m=ALERT_META[type]||{label:type,color:C.yellow,icon:"⚠"};
  return <span style={{fontFamily:F,fontSize:small?"9px":"10px",color:m.color,
    background:`${m.color}15`,border:`1px solid ${m.color}44`,
    borderRadius:"2px",padding:small?"1px 5px":"2px 6px"}}>
    {m.icon} {m.label}
  </span>;
};
function Ticker() {
  const [t,setT]=useState(5);
  useEffect(()=>{const i=setInterval(()=>setT(v=>v<=0?5:v-1),1000);return()=>clearInterval(i);},[]);
  return <span style={{fontFamily:F,fontSize:"11px",color:C.muted}}>refresh in {t}s</span>;
}

// ─── MONITOR CARDS ─────────────────────────────────────────────────────────
function CardLarge({project,onOpen}) {
  const col=SC[project.status];
  const tp=project.testsTotal>0?Math.round((project.testsPassing/project.testsTotal)*100):null;
  return (
    <div style={{background:C.surface,border:`1px solid ${col}44`,borderLeft:`4px solid ${col}`,
      borderRadius:"3px",padding:"20px",display:"flex",flexDirection:"column",gap:"16px",
      boxShadow:`0 0 28px ${col}0E`,transition:"box-shadow 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 0 36px ${col}22`}
      onMouseLeave={e=>e.currentTarget.style.boxShadow=`0 0 28px ${col}0E`}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span style={{color:col,fontSize:"10px",animation:"errpulse 1.4s ease-in-out infinite"}}>●</span>
            <span style={{fontFamily:F,fontSize:"16px",color:C.blue,fontWeight:700}}>{project.name}</span>
            <Badge status={project.status}/>
          </div>
          <Lbl>{project.description}</Lbl>
        </div>
        <Btn col={col} onClick={()=>onOpen(project.id)}>&gt; open project</Btn>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"20px"}}>
        <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
          <div>
            <Lbl>phase_progress</Lbl>
            <div style={{marginTop:"8px"}}><PhaseTrack progress={project.progress} phaseIdx={project.phaseIdx} color={col}/></div>
            <span style={{fontFamily:F,fontSize:"11px",color:col,marginTop:"6px",display:"block"}}>{project.phase}</span>
          </div>
          <div>
            <Lbl>active_alerts</Lbl>
            <div style={{display:"flex",flexDirection:"column",gap:"6px",marginTop:"8px"}}>
              {project.alerts.length>0
                ?project.alerts.map(a=><AlertChip key={a} type={a}/>)
                :<span style={{fontFamily:F,fontSize:"11px",color:C.green}}>✓ no alerts</span>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
            <Tile label="verify" value={project.verifyStatus}
              color={project.verifyStatus==="PASSED"?C.green:project.verifyStatus==="FAILED"?C.red:C.yellow}/>
            <Tile label="artifacts" value={project.artifacts==="clean"?"clean":"drift"}
              color={project.artifacts==="clean"?C.green:C.orange}/>
          </div>
          {tp!==null&&<>
            <BarRow label="tests" right={`${project.testsPassing}/${project.testsTotal} · ${tp}%`}
              rightColor={tp>=80?C.green:tp>=60?C.orange:C.red}>
              <MiniBar value={project.testsPassing} total={project.testsTotal} h={5}
                color={tp>=80?C.green:tp>=60?C.orange:C.red}/>
            </BarRow>
            <BarRow label="coverage" right={`${project.coverage}%`}
              rightColor={project.coverage>=80?C.green:project.coverage>=60?C.orange:C.red}>
              <MiniBar value={project.coverage} total={100} h={5}
                color={project.coverage>=80?C.green:project.coverage>=60?C.orange:C.red}/>
            </BarRow>
          </>}
          <div style={{display:"flex",gap:"6px"}}>
            <Tile label="last_commit" value={project.lastCommit} color={C.teal}/>
            <Tile label="vel/wk" value={project.commitVelocity} color={C.teal}/>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardMedium({project,onOpen}) {
  const col=SC[project.status];
  const tp=project.testsTotal>0?Math.round((project.testsPassing/project.testsTotal)*100):null;
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${col}`,
      borderRadius:"3px",padding:"16px",display:"flex",flexDirection:"column",gap:"12px",
      transition:"box-shadow 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 0 0 1px ${col}33`}
      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"3px"}}>
            <span style={{color:col,fontSize:"9px"}}>●</span>
            <span style={{fontFamily:F,fontSize:"13px",color:C.blue,fontWeight:700}}>{project.name}</span>
          </div>
          <Lbl>{project.phase}</Lbl>
        </div>
        <Badge status={project.status} small/>
      </div>
      <PhaseTrack progress={project.progress} phaseIdx={project.phaseIdx} color={col}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}}>
        <Tile label="verify" value={project.verifyStatus} small
          color={project.verifyStatus==="PASSED"?C.green:project.verifyStatus==="FAILED"?C.red:C.yellow}/>
        <Tile label="artifacts" value={project.artifacts==="clean"?"clean":"drift"} small
          color={project.artifacts==="clean"?C.green:C.orange}/>
      </div>
      {tp!==null&&<div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
        <BarRow label="tests" right={`${project.testsPassing}/${project.testsTotal} · ${tp}%`}
          rightColor={tp>=80?C.green:tp>=60?C.orange:C.red}>
          <MiniBar value={project.testsPassing} total={project.testsTotal} h={4}
            color={tp>=80?C.green:tp>=60?C.orange:C.red}/>
        </BarRow>
        <BarRow label="coverage" right={`${project.coverage}%`}
          rightColor={project.coverage>=80?C.green:project.coverage>=60?C.orange:C.red}>
          <MiniBar value={project.coverage} total={100} h={4}
            color={project.coverage>=80?C.green:project.coverage>=60?C.orange:C.red}/>
        </BarRow>
      </div>}
      {project.alerts.length>0
        ?<div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
          {project.alerts.map(a=><AlertChip key={a} type={a} small/>)}
        </div>
        :<span style={{fontFamily:F,fontSize:"10px",color:C.green}}>✓ no alerts</span>}
      <Btn col={col} full onClick={()=>onOpen(project.id)}>&gt; open project</Btn>
    </div>
  );
}

function CardSmall({project,onOpen}) {
  const col=SC[project.status];
  const tp=project.testsTotal>0?Math.round((project.testsPassing/project.testsTotal)*100):null;
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${col}`,
      borderRadius:"3px",padding:"14px",display:"flex",flexDirection:"column",gap:"10px",
      transition:"box-shadow 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 0 0 1px ${col}33`}
      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{color:col,fontSize:"9px"}}>●</span>
          <span style={{fontFamily:F,fontSize:"12px",color:C.blue,fontWeight:700}}>{project.name}</span>
        </div>
        <Badge status={project.status} small/>
      </div>
      <PhaseTrack progress={project.progress} phaseIdx={project.phaseIdx} color={col} compact/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
        <MicroTile label="verify"
          value={project.verifyStatus==="PASSED"?"✓ pass":project.verifyStatus==="FAILED"?"✗ fail":"pending"}
          color={project.verifyStatus==="PASSED"?C.green:project.verifyStatus==="FAILED"?C.red:C.yellow}/>
        <MicroTile label="artifacts" value={project.artifacts==="clean"?"✓ clean":"~ drift"}
          color={project.artifacts==="clean"?C.green:C.orange}/>
        <MicroTile label="tests" value={tp!==null?`${tp}%`:"n/a"}
          color={tp!==null?(tp>=80?C.green:tp>=60?C.orange:C.red):C.muted}/>
        <MicroTile label="commit" value={project.lastCommit} color={C.teal}/>
      </div>
      {project.alerts.length>0
        ?<div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
          {project.alerts.map(a=><AlertChip key={a} type={a} small/>)}
        </div>
        :<span style={{fontFamily:F,fontSize:"10px",color:C.green}}>✓ no alerts</span>}
      <button onClick={()=>onOpen(project.id)} style={{
        fontFamily:F,fontSize:"10px",color:C.dim,background:"transparent",
        border:`1px solid ${C.border}`,borderRadius:"2px",padding:"5px 0",
        cursor:"pointer",width:"100%",transition:"all 0.15s"}}
        onMouseEnter={e=>{e.currentTarget.style.color=col;e.currentTarget.style.borderColor=`${col}55`;}}
        onMouseLeave={e=>{e.currentTarget.style.color=C.dim;e.currentTarget.style.borderColor=C.border;}}>
        &gt; open
      </button>
    </div>
  );
}

// Shared sub-atoms
const Tile = ({label,value,color,small}) => (
  <div style={{background:C.surface2,borderRadius:"2px",padding:small?"8px 10px":"10px 12px"}}>
    <div style={{fontFamily:F,fontSize:"9px",color:C.muted,marginBottom:"3px"}}>{label}</div>
    <div style={{fontFamily:F,fontSize:small?"12px":"14px",color,fontWeight:700}}>{value}</div>
  </div>
);
const MicroTile = ({label,value,color}) => (
  <div style={{background:C.surface2,borderRadius:"2px",padding:"6px 8px"}}>
    <div style={{fontFamily:F,fontSize:"9px",color:C.muted,marginBottom:"2px"}}>{label}</div>
    <div style={{fontFamily:F,fontSize:"11px",color,fontWeight:700}}>{value}</div>
  </div>
);
const BarRow = ({label,right,rightColor,children}) => (
  <div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
      <Lbl>{label}</Lbl>
      <span style={{fontFamily:F,fontSize:"10px",color:rightColor}}>{right}</span>
    </div>
    {children}
  </div>
);
const Btn = ({col,onClick,full,children}) => (
  <button onClick={onClick} style={{
    fontFamily:F,fontSize:"11px",color:col,background:"transparent",
    border:`1px solid ${col}44`,borderRadius:"2px",padding:"6px 14px",
    cursor:"pointer",width:full?"100%":"auto",transition:"background 0.15s",letterSpacing:"0.02em"}}
    onMouseEnter={e=>e.currentTarget.style.background=`${col}15`}
    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
    {children}
  </button>
);

// ─── MONITOR VIEW ──────────────────────────────────────────────────────────
function MonitorView({onOpen}) {
  const [filter,setFilter]=useState("all");
  const [sortBy,setSortBy]=useState("status");
  const [time,setTime]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t);},[]);

  const counts={};
  PROJECTS.forEach(p=>{counts[p.status]=(counts[p.status]||0)+1;});
  const totalAlerts=PROJECTS.reduce((s,p)=>s+p.alerts.length,0);

  const priority={error:0,warning:1,stalled:2,healthy:3};
  const sortFns={
    status:(a,b)=>priority[a.status]-priority[b.status],
    name:(a,b)=>a.name.localeCompare(b.name),
    velocity:(a,b)=>b.commitVelocity-a.commitVelocity,
    alerts:(a,b)=>b.alerts.length-a.alerts.length,
  };
  let projects=[...PROJECTS].sort(sortFns[sortBy]);
  if(filter!=="all") projects=projects.filter(p=>p.status===filter);

  return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {/* Topbar */}
      <div style={{display:"flex",alignItems:"center",height:"44px",padding:"0 20px",
        background:C.surface,borderBottom:`1px solid ${C.border}`,gap:"12px"}}>
        <span style={{fontFamily:F,fontSize:"14px",color:C.blue,fontWeight:700}}>aitri</span>
        <span style={{fontFamily:F,fontSize:"12px",color:C.purple}}>hub</span>
        <span style={{fontFamily:F,fontSize:"10px",color:C.comment}}>// monitor</span>
        <div style={{flex:1}}/>
        {Object.entries(counts).map(([s,n])=>(
          <span key={s} style={{fontFamily:F,fontSize:"11px",color:SC[s]||C.muted}}>● {n} {s}</span>
        ))}
        <div style={{width:1,height:14,background:C.border}}/>
        {totalAlerts>0&&<span style={{fontFamily:F,fontSize:"11px",color:C.yellow,
          background:`${C.yellow}15`,border:`1px solid ${C.yellow}44`,
          borderRadius:"2px",padding:"2px 8px"}}>⚠ {totalAlerts} alerts</span>}
        <Ticker/>
        <span style={{fontFamily:F,fontSize:"11px",color:C.muted}}>
          {time.toLocaleTimeString("en-US",{hour12:false})}
        </span>
      </div>
      {/* Filter/sort bar */}
      <div style={{display:"flex",alignItems:"center",height:"36px",padding:"0 20px",
        background:C.surface,borderBottom:`1px solid ${C.border}`}}>
        <Lbl>filter</Lbl>
        {["all","healthy","warning","error","stalled"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{
            fontFamily:F,fontSize:"11px",color:filter===f?(SC[f]||C.blue):C.muted,
            background:"transparent",border:"none",
            borderBottom:`2px solid ${filter===f?(SC[f]||C.blue):"transparent"}`,
            padding:"0 12px",height:"36px",cursor:"pointer",transition:"color 0.15s"}}>{f}</button>
        ))}
        <div style={{flex:1}}/>
        <Lbl>sort</Lbl>
        {["status","name","velocity","alerts"].map(s=>(
          <button key={s} onClick={()=>setSortBy(s)} style={{
            fontFamily:F,fontSize:"11px",color:sortBy===s?C.blue:C.muted,
            background:"transparent",border:"none",padding:"0 10px",cursor:"pointer"}}>{s}</button>
        ))}
      </div>
      {/* Bento grid */}
      <div style={{flex:1,padding:"20px",display:"grid",
        gridTemplateColumns:"repeat(3,1fr)",gridAutoRows:"auto",
        gap:"14px",alignContent:"start",overflowY:"auto"}}>
        {projects.map((p,i)=>{
          const w=getWeight(p);
          return (
            <div key={p.id} style={{gridColumn:w==="large"?"span 2":"span 1",
              animation:`cardIn 0.25s ease ${i*0.06}s both`}}>
              {w==="large"&&<CardLarge project={p} onOpen={onOpen}/>}
              {w==="medium"&&<CardMedium project={p} onOpen={onOpen}/>}
              {w==="small"&&<CardSmall project={p} onOpen={onOpen}/>}
            </div>
          );
        })}
      </div>
      <footer style={{padding:"6px 20px",borderTop:`1px solid ${C.border}`,
        background:C.surface,display:"flex",justifyContent:"space-between"}}>
        <span style={{fontFamily:F,fontSize:"10px",color:C.muted}}>// ~/.aitri-hub/dashboard.json · 100% local</span>
        <span style={{fontFamily:F,fontSize:"10px",color:C.muted}}>{projects.length} projects · aitri-hub v0.3</span>
      </footer>
    </div>
  );
}

// ─── DETAIL VIEW ───────────────────────────────────────────────────────────
const NAV=[
  {id:"overview",  label:"overview",  icon:"◈"},
  {id:"artifacts", label:"artifacts", icon:"▣"},
  {id:"commits",   label:"commits",   icon:"◎"},
  {id:"alerts",    label:"alerts",    icon:"⚠"},
];

function DetailView({projectId,onBack}) {
  const project=PROJECTS.find(p=>p.id===projectId);
  const [section,setSection]=useState("overview");
  const col=SC[project.status];

  const sectionMap={
    overview:<OverviewSection project={project}/>,
    artifacts:<ArtifactsSection project={project}/>,
    commits:<CommitsSection project={project}/>,
    alerts:<AlertsSection project={project}/>,
  };

  return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {/* Topbar */}
      <div style={{display:"flex",alignItems:"center",height:"44px",padding:"0 20px",
        background:C.surface,borderBottom:`1px solid ${C.border}`,gap:"10px"}}>
        <span style={{fontFamily:F,fontSize:"14px",color:C.blue,fontWeight:700}}>aitri</span>
        <span style={{fontFamily:F,fontSize:"12px",color:C.purple}}>hub</span>
        <span style={{fontFamily:F,fontSize:"10px",color:C.border}}>·</span>
        <span style={{fontFamily:F,fontSize:"12px",color:C.blue}}>{project.name}</span>
        <span style={{fontFamily:F,fontSize:"10px",color:C.comment}}>// {section}</span>
        <div style={{flex:1}}/>
        <Ticker/>
      </div>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Sidebar */}
        <div style={{width:"210px",flexShrink:0,background:C.surface,
          borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column"}}>
          <button onClick={onBack} style={{fontFamily:F,fontSize:"11px",color:C.dim,
            background:"transparent",border:"none",borderBottom:`1px solid ${C.border}`,
            padding:"10px 14px",cursor:"pointer",textAlign:"left",
            display:"flex",alignItems:"center",gap:"6px",transition:"color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.color=C.text}
            onMouseLeave={e=>e.currentTarget.style.color=C.dim}>
            ← monitor
          </button>
          {/* Identity */}
          <div style={{padding:"16px 14px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"6px"}}>
              <span style={{color:col,fontSize:"9px"}}>●</span>
              <span style={{fontFamily:F,fontSize:"13px",color:C.blue,fontWeight:700}}>{project.name}</span>
            </div>
            <Badge status={project.status} small/>
            <div style={{fontFamily:F,fontSize:"10px",color:C.comment,marginTop:"8px"}}>// {project.branch}</div>
            <div style={{fontFamily:F,fontSize:"9px",color:C.muted,marginTop:"2px"}}>
              {project.type==="remote"?"⌥ github":"⌥ local"}
            </div>
          </div>
          {/* Phase mini */}
          <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`}}>
            <Lbl>phase</Lbl>
            <div style={{display:"flex",gap:"3px",margin:"7px 0 4px"}}>
              {PHASES_SHORT.map((_,i)=>(
                <div key={i} style={{flex:1,height:"4px",borderRadius:"1px",
                  background:i<project.progress?col:C.surface2}}/>
              ))}
            </div>
            <span style={{fontFamily:F,fontSize:"10px",color:col}}>{project.phase}</span>
          </div>
          {/* Nav */}
          <div style={{padding:"8px 0"}}>
            <div style={{fontFamily:F,fontSize:"9px",color:C.muted,padding:"4px 14px 6px"}}>▸ SECTIONS</div>
            {NAV.map(item=>{
              const active=section===item.id;
              const hasAlert=item.id==="alerts"&&project.alerts.length>0;
              return (
                <button key={item.id} onClick={()=>setSection(item.id)} style={{
                  fontFamily:F,fontSize:"12px",color:active?C.text:C.dim,
                  background:active?C.surface2:"transparent",border:"none",
                  borderLeft:`3px solid ${active?col:"transparent"}`,
                  padding:"8px 14px",cursor:"pointer",width:"100%",textAlign:"left",
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                  transition:"all 0.15s"}}
                  onMouseEnter={e=>{if(!active)e.currentTarget.style.color=C.text;}}
                  onMouseLeave={e=>{if(!active)e.currentTarget.style.color=C.dim;}}>
                  <span>{item.icon} {item.label}</span>
                  {hasAlert&&<span style={{fontFamily:F,fontSize:"9px",color:C.yellow,
                    background:`${C.yellow}20`,borderRadius:"2px",padding:"1px 5px"}}>
                    {project.alerts.length}
                  </span>}
                </button>
              );
            })}
          </div>
          <div style={{flex:1}}/>
          {/* Quick stats */}
          <div style={{padding:"12px 14px",borderTop:`1px solid ${C.border}`}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
              {[
                {l:"phases",     v:`${project.progress}/${project.totalPhases||5}`},
                {l:"rejections", v:project.rejections, color:project.rejections>0?C.red:C.green},
                {l:"velocity",   v:`${project.commitVelocity}/wk`},
                {l:"artifacts",  v:project.artifactTree.reduce((s,f)=>s+(f.children?.length||0),0)},
              ].map(({l,v,color})=>(
                <div key={l}>
                  <div style={{fontFamily:F,fontSize:"9px",color:C.muted}}>{l}</div>
                  <div style={{fontFamily:F,fontSize:"12px",color:color||C.teal,fontWeight:700}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Content */}
        <div style={{flex:1,padding:"24px 28px",overflowY:"auto"}}>
          <div style={{animation:"cardIn 0.2s ease both"}}>
            {sectionMap[section]}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DETAIL SECTIONS ───────────────────────────────────────────────────────
function Card({label,children}) {
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:"3px",padding:"16px"}}>
      {label&&<div style={{fontFamily:F,fontSize:"10px",color:C.comment,marginBottom:"12px"}}>// {label}:</div>}
      <div>{children}</div>
    </div>
  );
}

function OverviewSection({project}) {
  const col=SC[project.status];
  const tp=project.testsTotal>0?Math.round((project.testsPassing/project.testsTotal)*100):null;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      <Card label="project">
        <span style={{fontFamily:F,fontSize:"12px",color:C.dim}}>{project.description}</span>
        <div style={{fontFamily:F,fontSize:"11px",color:C.muted,marginTop:"6px"}}>// {project.path}</div>
      </Card>
      <Card label="phase_progress">
        <div style={{display:"flex",gap:"4px",marginBottom:"8px"}}>
          {PHASES.map((p,i)=>{
            const done=i<project.progress, current=p===project.phase;
            return (
              <div key={p} style={{flex:1,display:"flex",flexDirection:"column",gap:"4px",alignItems:"center"}}>
                <div style={{height:"6px",width:"100%",borderRadius:"2px",
                  background:done?col:current?C.blue:C.surface2,
                  border:current?`1px solid ${C.blue}`:"none",transition:"background 0.3s"}}/>
                <span style={{fontFamily:F,fontSize:"9px",color:done?col:current?C.blue:C.muted,
                  fontWeight:current?600:400}}>{PHASES_SHORT[i]}</span>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginTop:"4px"}}>
          {project.approvedPhases.map(p=>(
            <span key={p} style={{fontFamily:F,fontSize:"10px",color:C.green}}>✓ {p}</span>
          ))}
        </div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px"}}>
        {[
          {l:"last_commit",     v:project.lastCommit,        c:C.teal},
          {l:"commit_velocity", v:`${project.commitVelocity}/wk`, c:C.teal},
          {l:"active_branch",   v:project.branch,            c:C.purple},
          {l:"verify_status",   v:project.verifyStatus,
            c:project.verifyStatus==="PASSED"?C.green:project.verifyStatus==="FAILED"?C.red:C.yellow},
          {l:"artifacts",       v:`${project.artifactTree.reduce((s,f)=>s+(f.children?.length||0),0)} files`,
            c:project.artifacts==="clean"?C.green:C.orange},
          {l:"rejections",      v:project.rejections,        c:project.rejections===0?C.green:C.red},
        ].map(({l,v,c})=>(
          <div key={l} style={{background:C.surface2,borderRadius:"3px",padding:"12px 14px"}}>
            <Lbl>{l}</Lbl>
            <div style={{fontFamily:F,fontSize:"16px",fontWeight:700,color:c,marginTop:"6px"}}>{v}</div>
          </div>
        ))}
      </div>
      {tp!==null&&(
        <Card label="test_results">
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            <BarRow label="tests_passing" right={`${project.testsPassing}/${project.testsTotal}`}
              rightColor={tp>=80?C.green:tp>=60?C.orange:C.red}>
              <MiniBar value={project.testsPassing} total={project.testsTotal} h={5}
                color={tp>=80?C.green:tp>=60?C.orange:C.red}/>
            </BarRow>
            <BarRow label="coverage" right={`${project.coverage}%`}
              rightColor={project.coverage>=80?C.green:project.coverage>=60?C.orange:C.red}>
              <MiniBar value={project.coverage} total={100} h={5}
                color={project.coverage>=80?C.green:project.coverage>=60?C.orange:C.red}/>
            </BarRow>
          </div>
        </Card>
      )}
    </div>
  );
}

// Artifact Explorer — file tree left, reader right
function ArtifactsSection({project}) {
  const [openFolders,setOpenFolders]=useState(()=>{
    const s={};
    project.artifactTree.forEach(f=>{s[f.id]=true;});
    return s;
  });
  const [selected,setSelected]=useState(null);

  const selectedFile=selected
    ?project.artifactTree.flatMap(f=>f.children||[]).find(f=>f.id===selected)
    :null;

  const toggleFolder=id=>setOpenFolders(prev=>({...prev,[id]:!prev[id]}));

  return (
    <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:"0",
      background:C.surface,border:`1px solid ${C.border}`,borderRadius:"3px",
      minHeight:"420px",overflow:"hidden"}}>

      {/* File tree */}
      <div style={{borderRight:`1px solid ${C.border}`,overflowY:"auto"}}>
        <div style={{fontFamily:F,fontSize:"10px",color:C.comment,
          padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
          // artifacts · {project.artifactTree.reduce((s,f)=>s+(f.children?.length||0),0)} files
        </div>
        {project.artifactTree.map(folder=>{
          const isOpen=openFolders[folder.id];
          const folderCol=SC[project.status]||C.purple;
          // derive folder status from children
          const childStatuses=(folder.children||[]).map(c=>c.status);
          const folderAlert=childStatuses.includes("rejected")||childStatuses.includes("drift");
          const folderOk=childStatuses.every(s=>s==="approved");
          const fCol=folderAlert?C.red:folderOk?C.green:C.comment;
          return (
            <div key={folder.id}>
              {/* Folder row */}
              <div onClick={()=>toggleFolder(folder.id)} style={{
                display:"flex",alignItems:"center",gap:"7px",
                padding:"8px 14px",cursor:"pointer",
                background:"transparent",transition:"background 0.12s",
                borderBottom:`1px solid ${C.border}44`}}
                onMouseEnter={e=>e.currentTarget.style.background=C.surfaceRaised}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{color:C.purple,fontSize:"11px"}}>{isOpen?"▾":"▸"}</span>
                <span style={{fontFamily:F,fontSize:"11px",color:C.purple,flex:1}}>{folder.name}</span>
                <span style={{fontFamily:F,fontSize:"9px",color:fCol}}>
                  {folderAlert?"✗":folderOk?"✓":"○"}
                </span>
              </div>
              {/* Children */}
              {isOpen&&(folder.children||[]).map(file=>{
                const fcol=ARTIFACT_COL[file.status]||C.muted;
                const isSel=selected===file.id;
                return (
                  <div key={file.id} onClick={()=>setSelected(isSel?null:file.id)} style={{
                    display:"flex",alignItems:"center",gap:"7px",
                    padding:"7px 14px 7px 28px",cursor:"pointer",
                    background:isSel?C.surface2:"transparent",
                    borderLeft:`3px solid ${isSel?fcol:"transparent"}`,
                    transition:"all 0.12s"}}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=C.surfaceRaised;}}
                    onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background="transparent";}}>
                    <span style={{color:fcol,fontSize:"10px"}}>▣</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:F,fontSize:"11px",color:C.text,
                        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {file.name}
                      </div>
                      <div style={{fontFamily:F,fontSize:"9px",color:C.muted}}>{file.size} · {file.updated}</div>
                    </div>
                    <span style={{fontFamily:F,fontSize:"9px",color:fcol,
                      border:`1px solid ${fcol}44`,borderRadius:"2px",padding:"1px 4px",flexShrink:0}}>
                      {file.status}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Reader panel */}
      <div style={{display:"flex",flexDirection:"column",overflowY:"auto"}}>
        {selectedFile ? (
          <>
            <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,
              display:"flex",alignItems:"center",justifyContent:"space-between",
              background:C.surface2}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                <span style={{color:ARTIFACT_COL[selectedFile.status],fontSize:"10px"}}>▣</span>
                <span style={{fontFamily:F,fontSize:"12px",color:C.text}}>{selectedFile.name}</span>
                <span style={{fontFamily:F,fontSize:"10px",color:ARTIFACT_COL[selectedFile.status],
                  border:`1px solid ${ARTIFACT_COL[selectedFile.status]}44`,
                  borderRadius:"2px",padding:"1px 5px"}}>[{selectedFile.status}]</span>
              </div>
              <span style={{fontFamily:F,fontSize:"10px",color:C.muted}}>
                {selectedFile.size} · {selectedFile.updated}
              </span>
            </div>
            <div style={{flex:1,padding:"16px",background:C.bg,fontFamily:F,fontSize:"12px",
              color:C.dim,lineHeight:"1.8",overflowY:"auto"}}>
              <ArtifactContent file={selectedFile}/>
            </div>
          </>
        ) : (
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
            flexDirection:"column",gap:"8px"}}>
            <span style={{fontFamily:F,fontSize:"11px",color:C.muted}}>// select a file to read</span>
            <span style={{fontFamily:F,fontSize:"10px",color:C.muted}}>← click any artifact in the tree</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ArtifactContent({file}) {
  const col=ARTIFACT_COL[file.status]||C.muted;
  const blocks={
    approved:(
      <>
        <Line c={C.comment}># {file.name}</Line>
        <Spacer/>
        <Line c={C.comment}>## Status</Line>
        <Line c={C.green}>✓ Approved by PM persona · {file.updated}</Line>
        <Spacer/>
        <Line c={C.comment}>## Verification</Line>
        <Line c={C.green}>✓ Schema valid</Line>
        <Line c={C.green}>✓ Spec alignment confirmed</Line>
        <Line c={C.green}>✓ QA persona sign-off</Line>
        <Spacer/>
        <Line c={C.comment}>## Summary</Line>
        <Line c={C.dim}>Artifact generated and approved during {file.phase}.</Line>
        <Line c={C.dim}>All verification checks passed. No drift detected.</Line>
      </>
    ),
    drift:(
      <>
        <Line c={C.comment}># {file.name}</Line>
        <Spacer/>
        <Line c={C.comment}>## Status</Line>
        <Line c={C.orange}>~ Drift detected · last check {file.updated}</Line>
        <Spacer/>
        <Line c={C.comment}>## Drift report</Line>
        <Line c={C.orange}>  3 endpoints added without spec update</Line>
        <Line c={C.orange}>  2 data models diverged from approved schema</Line>
        <Spacer/>
        <Line c={C.comment}>## Required action</Line>
        <Line c={C.yellow}>→ Update spec to reflect implementation changes</Line>
        <Line c={C.yellow}>→ Re-run `aitri verify` to clear drift</Line>
        <Line c={C.yellow}>→ Get Architect persona approval on changes</Line>
      </>
    ),
    rejected:(
      <>
        <Line c={C.comment}># {file.name}</Line>
        <Spacer/>
        <Line c={C.comment}>## Status</Line>
        <Line c={C.red}>✗ Rejected · {file.updated}</Line>
        <Spacer/>
        <Line c={C.comment}>## Rejection reason</Line>
        <Line c={C.dim}>Architecture does not account for inventory sync latency.</Line>
        <Line c={C.dim}>Missing failure handling for payment gateway timeouts.</Line>
        <Line c={C.dim}>Proposed service boundaries conflict with existing CMS contracts.</Line>
        <Spacer/>
        <Line c={C.comment}>## Next steps</Line>
        <Line c={C.yellow}>→ Address latency budget in service design</Line>
        <Line c={C.yellow}>→ Add circuit breaker pattern for payment gateway</Line>
        <Line c={C.yellow}>→ Resubmit for Architect persona review</Line>
      </>
    ),
    pending:(
      <>
        <Line c={C.comment}># {file.name}</Line>
        <Spacer/>
        <Line c={C.comment}>## Status</Line>
        <Line c={C.muted}>○ Pending approval · {file.updated}</Line>
        <Spacer/>
        <Line c={C.muted}>// Awaiting PM persona review...</Line>
        <Line c={C.muted}>// No verification run yet.</Line>
      </>
    ),
    in_progress:(
      <>
        <Line c={C.comment}># {file.name}</Line>
        <Spacer/>
        <Line c={C.comment}>## Status</Line>
        <Line c={C.blue}>◎ In progress · updated {file.updated}</Line>
        <Spacer/>
        <Line c={C.muted}>// Active phase — collecting results...</Line>
        <Spacer/>
        <Line c={C.comment}>## Partial results</Line>
        <Line c={C.green}>✓ 89 tests passing</Line>
        <Line c={C.red}>✗  3 tests failing</Line>
        <Line c={C.dim}>   └─ finance.CurrencyFormatter.edgeCases</Line>
        <Line c={C.dim}>   └─ budget.Projection.nullInput</Line>
        <Line c={C.dim}>   └─ reports.Export.pdfEncoding</Line>
      </>
    ),
  };
  return blocks[file.status]||<Line c={C.muted}>// no content</Line>;
}

const Line=({c,children})=><div style={{color:c,marginBottom:"2px"}}>{children}</div>;
const Spacer=()=><div style={{height:"10px"}}/>;

function CommitsSection({project}) {
  return (
    <Card label={`commit_history · ${project.branch}`}>
      <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
        {project.commits.map((c,i)=>(
          <div key={c.hash} style={{display:"flex",gap:"12px",alignItems:"flex-start",
            padding:"10px 12px",borderRadius:"2px",
            borderLeft:`2px solid ${i===0?C.teal:C.border}`,
            animation:`cardIn 0.2s ease ${i*0.04}s both`}}>
            <span style={{fontFamily:F,fontSize:"11px",color:C.purple,flexShrink:0}}>{c.hash}</span>
            <span style={{fontFamily:F,fontSize:"12px",color:C.text,flex:1}}>{c.msg}</span>
            <span style={{fontFamily:F,fontSize:"10px",color:C.muted,flexShrink:0}}>{c.time}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AlertsSection({project}) {
  if(project.alerts.length===0) return (
    <Card label="alerts">
      <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"20px 0"}}>
        <span style={{color:C.green,fontSize:"20px"}}>✓</span>
        <span style={{fontFamily:F,fontSize:"13px",color:C.green}}>no active alerts</span>
      </div>
    </Card>
  );
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
      {project.alerts.map(a=>{
        const m=ALERT_META[a]||{label:a,color:C.yellow,icon:"⚠",desc:""};
        return (
          <div key={a} style={{background:C.surface,border:`1px solid ${m.color}44`,
            borderLeft:`3px solid ${m.color}`,borderRadius:"3px",padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px"}}>
              <span style={{color:m.color,fontSize:"14px"}}>{m.icon}</span>
              <span style={{fontFamily:F,fontSize:"13px",color:m.color,fontWeight:700}}>{m.label}</span>
            </div>
            <div style={{fontFamily:F,fontSize:"12px",color:C.dim,lineHeight:"1.7",
              background:C.bg,padding:"10px 12px",borderRadius:"2px"}}>
              {m.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ROOT ──────────────────────────────────────────────────────────────────
export default function AitriHub() {
  const [view,setView]=useState("monitor");
  const [selectedId,setSelectedId]=useState(null);

  const openProject=id=>{setSelectedId(id);setView("detail");};
  const backToMonitor=()=>{setView("monitor");setSelectedId(null);};

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0D1117;}
        @keyframes cardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes errpulse{0%,100%{opacity:1}50%{opacity:0.3}}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:#0D1117}
        ::-webkit-scrollbar-thumb{background:#30363D;border-radius:3px}
      `}</style>
      {view==="monitor"&&<MonitorView onOpen={openProject}/>}
      {view==="detail"&&<DetailView projectId={selectedId} onBack={backToMonitor}/>}
    </>
  );
}
