'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const ALL_SYMBOLS = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA","AMD","INTC","AVGO",
  "QCOM","TXN","MU","AMAT","LRCX","KLAC","MRVL","ADI","NXPI","ON",
  "ORCL","CRM","ADBE","NOW","INTU","PANW","CRWD","SNOW","DDOG","ZS",
  "SHOP","MELI","BKNG","ABNB","UBER","LYFT","DASH","RBLX","HOOD","COIN",
  "NFLX","CMCSA","WBD","PARA","TTWO","EA","MTCH","SPOT","ROKU","TTD",
  "COST","SBUX","MCD","YUM","DKNG","WYNN","LVS","MGM","NCLH","RCL",
  "AMGN","GILD","BIIB","REGN","VRTX","MRNA","BNTX","ILMN","IDXX","ALGN",
  "PYPL","SQ","AFRM","SOFI","UPST","PINS","SNAP","RIVN","LCID","PLTR",
  "TSM","ASML","SMCI","ARM","MCHP","SWKS","MPWR","ENPH","FSLR","SEDG",
  "AI","PATH","CFLT","MDB","DOCU","ZM","OKTA","NET","HUBS","TWLO"
]

function calcEMA(arr, p) {
  if (arr.length < p) return null
  const k = 2 / (p + 1)
  let e = arr.slice(0, p).reduce((a, b) => a + b) / p
  for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k)
  return parseFloat(e.toFixed(2))
}
function calcRSI(closes, p = 14) {
  if (closes.length < p + 1) return 50
  let g = 0, l = 0
  for (let i = closes.length - p; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) g += d; else l -= d
  }
  return parseFloat((100 - 100 / (1 + g / (l || 0.001))).toFixed(1))
}
function calcATR(candles, p = 14) {
  const trs = []
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i-1].c), Math.abs(candles[i].l - candles[i-1].c)))
  }
  const r = trs.slice(-p)
  return r.reduce((a, b) => a + b, 0) / r.length
}
function analyze(symbol, candles) {
  const closes = candles.map(c => c.c)
  const price = closes.at(-1), prev = closes.at(-2)
  const change = parseFloat(((price - prev) / prev * 100).toFixed(2))
  const e9 = calcEMA(closes, 9), e21 = calcEMA(closes, 21), e50 = calcEMA(closes, 50)
  const rsi = calcRSI(closes), atr = calcATR(candles)
  const pc = closes.slice(0, -1)
  const pe9 = calcEMA(pc, 9), pe21 = calcEMA(pc, 21)
  const crossUp = pe9 != null && pe21 != null && pe9 < pe21 && e9 > e21
  const crossDown = pe9 != null && pe21 != null && pe9 > pe21 && e9 < e21
  let signal = 'WAIT'
  if      (rsi < 42 && crossUp   && price > e50)                    signal = 'BUY'
  else if (rsi < 48 && e9 > e21  && price > e50 && change > 0)     signal = 'WATCH'
  else if (rsi > 62 && (crossDown||(e9 < e21 && price < e21)))     signal = 'SELL'
  else if (rsi > 55 && e9 < e21)                                   signal = 'WEAK_SELL'
  const eL = parseFloat((price * 0.998).toFixed(2))
  const eH = parseFloat((price * 1.005).toFixed(2))
  const sl = parseFloat((eL - atr * 1.5).toFixed(2))
  const t1 = parseFloat((eH + atr * 2).toFixed(2))
  const t2 = parseFloat((eH + atr * 3.5).toFixed(2))
  const rr = parseFloat(((t1 - eH) / Math.max(eH - sl, 0.01)).toFixed(1))
  return { symbol, price, change, rsi, ema9: e9, ema21: e21, ema50: e50, signal, entryLow: eL, entryHigh: eH, stopLoss: sl, target1: t1, target2: t2, riskReward: rr, closes: closes.slice(-30) }
}

function Spark({ data, color }) {
  const W=72,H=24,mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1
  const pts=data.map((v,i)=>`${(i/(data.length-1))*W},${H-((v-mn)/rng)*H}`).join(' ')
  return <svg width={W} height={H}><polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} strokeLinecap="round" strokeLinejoin="round"/></svg>
}

const SIG = {
  BUY:       {label:'شراء',        color:'#00ff88',bg:'rgba(0,255,136,0.08)',  border:'rgba(0,255,136,0.3)'},
  WATCH:     {label:'مراقبة دخول', color:'#fbbf24',bg:'rgba(251,191,36,0.07)', border:'rgba(251,191,36,0.3)'},
  SELL:      {label:'بيع / خروج',  color:'#ff4d4d',bg:'rgba(255,77,77,0.08)',  border:'rgba(255,77,77,0.3)'},
  WEAK_SELL: {label:'ضعف',         color:'#f97316',bg:'rgba(249,115,22,0.06)', border:'rgba(249,115,22,0.2)'},
  WAIT:      {label:'انتظار',      color:'#374151',bg:'rgba(55,65,81,0.04)',   border:'rgba(55,65,81,0.12)'},
}

export default function SignalBot() {
  const [stocks, setStocks]         = useState([])
  const [trades, setTrades]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [scanning, setScanning]     = useState(false)
  const [progress, setProgress]     = useState(0)
  const [curSym, setCurSym]         = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [countdown, setCountdown]   = useState(1800)
  const [filter, setFilter]         = useState('ALL')
  const [tab, setTab]               = useState('signals')
  const [failed, setFailed]         = useState(0)
  const scanRef = useRef(false)

  const runScan = useCallback(async () => {
    if (scanRef.current) return
    scanRef.current = true
    setScanning(true); setProgress(0); setFailed(0)
    const results = []; let fails = 0
    const BATCH = 5
    for (let i = 0; i < ALL_SYMBOLS.length; i += BATCH) {
      const batch = ALL_SYMBOLS.slice(i, i + BATCH)
      const batchResults = await Promise.all(batch.map(async sym => {
        setCurSym(sym)
        try {
          const res = await fetch(`/api/stock?symbol=${sym}`)
          const data = await res.json()
          if (data.error || !data.candles || data.candles.length < 20) return null
          return analyze(sym, data.candles)
        } catch { return null }
      }))
      batchResults.forEach(r => { if (r) results.push(r); else fails++ })
      setProgress(Math.round(((i + BATCH) / ALL_SYMBOLS.length) * 100))
      if (i + BATCH < ALL_SYMBOLS.length) await new Promise(r => setTimeout(r, 200))
    }
    const order = {BUY:0,WATCH:1,SELL:2,WEAK_SELL:3,WAIT:4}
    results.sort((a,b)=>(order[a.signal]??4)-(order[b.signal]??4))
    setTrades(prev => prev.map(t => {
      const u = results.find(s => s.symbol === t.symbol)
      if (!u) return t
      let status = t.status
      if (u.signal==='SELL' && t.status==='OPEN')    status='EXIT_NOW'
      if (u.price >= t.target1)                      status='TARGET1_HIT'
      if (u.price <= t.stopLoss && t.status==='OPEN') status='STOP_HIT'
      return {...t, currentPrice:u.price, currentRsi:u.rsi, currentSignal:u.signal, status}
    }))
    setStocks(results); setFailed(fails)
    setLastUpdate(new Date()); setLoading(false)
    setScanning(false); setProgress(100); setCountdown(1800)
    scanRef.current = false
  }, [])

  useEffect(() => { runScan() }, [])
  useEffect(() => {
    const iv = setInterval(() => setCountdown(c => { if (c<=1){runScan();return 1800} return c-1 }),1000)
    return () => clearInterval(iv)
  }, [runScan])

  const addTrade = s => {
    if (trades.find(t=>t.symbol===s.symbol)) return
    setTrades(p=>[...p,{id:Date.now(),symbol:s.symbol,entryLow:s.entryLow,entryHigh:s.entryHigh,stopLoss:s.stopLoss,target1:s.target1,target2:s.target2,openedAt:new Date().toLocaleString('ar-SA'),currentPrice:s.price,currentRsi:s.rsi,currentSignal:s.signal,status:'OPEN'}])
    setTab('trades')
  }
  const closeTrade = id => setTrades(p=>p.filter(t=>t.id!==id))
  const filtered = stocks.filter(s=>filter==='ALL'||(filter==='WATCH'?s.signal==='WATCH':s.signal===filter))
  const buys=stocks.filter(s=>s.signal==='BUY').length
  const sells=stocks.filter(s=>s.signal==='SELL').length
  const watchN=stocks.filter(s=>s.signal==='WATCH').length
  const alerts=trades.filter(t=>['EXIT_NOW','TARGET1_HIT','STOP_HIT'].includes(t.status))
  const mins=Math.floor(countdown/60),secs=String(countdown%60).padStart(2,'0')
  const fmt=n=>n?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})??'–'

  return (
    <div style={{minHeight:'100vh',background:'#050810',color:'#e2e8f0',fontFamily:"'JetBrains Mono','Fira Code',monospace",direction:'rtl'}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0a0e1a}::-webkit-scrollbar-thumb{background:#1e2a3a;border-radius:2px}
        @keyframes pg{0%,100%{box-shadow:0 0 6px #00ff88}50%{box-shadow:0 0 18px #00ff88}}
        @keyframes pr{0%,100%{box-shadow:0 0 6px #ff4d4d}50%{box-shadow:0 0 16px #ff4d4d}}
        @keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        .ld{animation:pg 2s infinite}.ad{animation:pr 1.5s infinite}.card{animation:fi .3s ease forwards}
      `}</style>

      {/* HEADER */}
      <div style={{background:'rgba(5,8,16,.97)',borderBottom:'1px solid #0d1524',padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100,backdropFilter:'blur(12px)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div className={scanning?'':'ld'} style={{width:7,height:7,borderRadius:'50%',background:scanning?'#fbbf24':'#00ff88',flexShrink:0}}/>
          <span style={{fontSize:9,color:'#4b5563',letterSpacing:1}}>
            {scanning?`تحليل ${curSym}...`:lastUpdate?`${lastUpdate.toLocaleTimeString('ar-SA')} · بعد ${mins}:${secs}`:'جاري التحميل...'}
          </span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {alerts.length>0&&<div className="ad" style={{background:'rgba(255,77,77,.1)',border:'1px solid rgba(255,77,77,.4)',borderRadius:20,padding:'2px 9px',fontSize:9,color:'#ff4d4d'}}>⚠ {alerts.length}</div>}
          <button onClick={runScan} disabled={scanning} style={{background:'transparent',border:'1px solid #0f1a2e',color:scanning?'#374151':'#4b5563',padding:'3px 10px',borderRadius:5,cursor:scanning?'not-allowed':'pointer',fontSize:9}}>
            {scanning?'جاري...':'⟳ مسح'}
          </button>
          <div style={{fontSize:14,fontWeight:700,letterSpacing:2}}>
            <span style={{color:'#00ff88'}}>SIGNAL</span><span>BOT</span>
            <span style={{fontSize:7,color:'#10b981',marginRight:4,border:'1px solid #10b98133',borderRadius:3,padding:'1px 3px'}}>LIVE</span>
          </div>
        </div>
      </div>

      {scanning&&<div style={{height:2,background:'#0d1524'}}><div style={{height:'100%',background:'linear-gradient(90deg,#00ff88,#10b981)',width:`${progress}%`,transition:'width .3s',boxShadow:'0 0 8px #00ff8855'}}/></div>}

      <div style={{padding:'14px',maxWidth:1100,margin:'0 auto'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14}}>
          {[{label:'شراء',val:buys,color:'#00ff88'},{label:'بيع',val:sells,color:'#ff4d4d'},{label:'مراقبة',val:watchN,color:'#fbbf24'},{label:'صفقاتي',val:trades.length,color:'#60a5fa'}].map(s=>(
            <div key={s.label} style={{background:`${s.color}08`,border:`1px solid ${s.color}20`,borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
              <div style={{fontSize:20,fontWeight:700,color:s.color}}>{loading?'–':s.val}</div>
              <div style={{fontSize:8,color:'#4b5563',marginTop:2,letterSpacing:1}}>{s.label}</div>
            </div>
          ))}
        </div>

        {loading&&(
          <div style={{textAlign:'center',padding:'50px 20px'}}>
            <div style={{fontSize:13,color:'#00ff88',marginBottom:4,letterSpacing:1}}>SIGNALBOT</div>
            <div style={{fontSize:10,color:'#4b5563',marginBottom:16}}>جاري جلب الأسعار الحقيقية<br/><span style={{fontSize:9,color:'#374151'}}>يرجى الانتظار دقيقة أو دقيقتين</span></div>
            <div style={{background:'#0d1524',borderRadius:6,height:6,overflow:'hidden',maxWidth:280,margin:'0 auto 8px'}}>
              <div style={{height:'100%',background:'linear-gradient(90deg,#00ff88,#10b981)',width:`${progress}%`,transition:'width .4s',borderRadius:6}}/>
            </div>
            <div style={{fontSize:10,color:'#374151'}}>{progress}% · {curSym}</div>
          </div>
        )}

        {!loading&&(
          <>
            <div style={{display:'flex',borderBottom:'1px solid #0d1524',marginBottom:14}}>
              {[{id:'signals',label:`إشارات (${stocks.length})`},{id:'trades',label:`صفقاتي (${trades.length})`,a:alerts.length}].map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)} style={{background:'transparent',borderBottom:tab===t.id?'2px solid #00ff88':'2px solid transparent',border:'none',color:tab===t.id?'#00ff88':'#4b5563',padding:'7px 14px',cursor:'pointer',fontSize:10,letterSpacing:1}}>
                  {t.label}{t.a>0&&<span style={{marginRight:4,background:'#ff4d4d',color:'#fff',borderRadius:'50%',width:13,height:13,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700}}>{t.a}</span>}
                </button>
              ))}
              <span style={{marginRight:'auto',alignSelf:'center',fontSize:8,color:'#1e2a3a',padding:'0 6px'}}>أسعار حقيقية · تأخر 15 دق{failed>0?` · ${failed} فشل`:''}</span>
            </div>

            {tab==='signals'&&(
              <>
                <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
                  {[{id:'ALL',l:'الكل'},{id:'BUY',l:'🟢 شراء'},{id:'SELL',l:'🔴 بيع'},{id:'WATCH',l:'🟡 مراقبة'}].map(f=>(
                    <button key={f.id} onClick={()=>setFilter(f.id)} style={{background:filter===f.id?'#0d1524':'transparent',border:`1px solid ${filter===f.id?'#1e2a3a':'#0d1524'}`,color:filter===f.id?'#e2e8f0':'#4b5563',padding:'4px 11px',borderRadius:20,cursor:'pointer',fontSize:9}}>{f.l}</button>
                  ))}
                  <span style={{marginRight:'auto',fontSize:8,color:'#1e2a3a',alignSelf:'center'}}>{filtered.length} سهم</span>
                </div>
                {filtered.length===0?<div style={{textAlign:'center',padding:'40px',color:'#1e2a3a',fontSize:11}}>لا توجد إشارات</div>:(
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:9}}>
                    {filtered.map((s,idx)=>{
                      const sg=SIG[s.signal]||SIG.WAIT
                      const already=trades.some(t=>t.symbol===s.symbol)
                      return (
                        <div key={s.symbol} className="card" style={{animationDelay:`${idx*.02}s`,background:sg.bg,border:`1px solid ${sg.border}`,borderRadius:11,padding:'13px 14px',transition:'transform .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:7}}>
                            <div>
                              <div style={{fontSize:15,fontWeight:700,letterSpacing:2}}>{s.symbol}</div>
                              <div style={{fontSize:17,fontWeight:300,color:sg.color,marginTop:1}}>${fmt(s.price)}</div>
                              <div style={{fontSize:9,color:s.change>=0?'#00ff88':'#ff4d4d',marginTop:1}}>{s.change>=0?'▲':'▼'} {Math.abs(s.change)}%</div>
                            </div>
                            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                              <Spark data={s.closes} color={sg.color}/>
                              <div style={{background:`${sg.color}18`,border:`1px solid ${sg.color}44`,borderRadius:20,padding:'2px 7px',fontSize:8,color:sg.color,fontWeight:700}}>{sg.label}</div>
                            </div>
                          </div>
                          <div style={{marginBottom:7}}>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:7,color:'#4b5563',marginBottom:2}}><span>RSI</span><span style={{color:sg.color}}>{s.rsi}</span></div>
                            <div style={{background:'#0a0e1a',borderRadius:3,height:4,overflow:'hidden'}}><div style={{width:`${s.rsi}%`,height:'100%',borderRadius:3,background:s.rsi<40?'#00ff88':s.rsi>60?'#ff4d4d':'#fbbf24',transition:'width .5s'}}/></div>
                          </div>
                          {(s.signal==='BUY'||s.signal==='WATCH')&&(
                            <div style={{background:'rgba(0,255,136,.04)',border:'1px solid rgba(0,255,136,.1)',borderRadius:7,padding:'7px 9px',marginBottom:7,display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                              {[{l:'منطقة الدخول',c:'#00ff88',v:`$${s.entryLow}–$${s.entryHigh}`},{l:'وقف الخسارة',c:'#ff4d4d',v:`$${s.stopLoss}`},{l:'الهدف 1',c:'#60a5fa',v:`$${s.target1}`},{l:'الهدف 2',c:'#a78bfa',v:`$${s.target2}`}].map(c=>(
                                <div key={c.l}><div style={{fontSize:7,color:'#4b5563',marginBottom:1}}>{c.l}</div><div style={{fontSize:10,color:c.c,fontWeight:600}}>{c.v}</div></div>
                              ))}
                              <div style={{gridColumn:'1/-1'}}><div style={{fontSize:7,color:'#4b5563',marginBottom:1}}>المخاطرة/العائد</div><div style={{fontSize:9,color:s.riskReward>=2?'#00ff88':'#fbbf24',fontWeight:600}}>1:{s.riskReward} {s.riskReward>=2?'✓ جيد':'⚠ مقبول'}</div></div>
                            </div>
                          )}
                          <div style={{display:'flex',gap:4,marginBottom:7}}>
                            {[{l:'EMA9',v:s.ema9},{l:'EMA21',v:s.ema21},{l:'EMA50',v:s.ema50}].map(e=>(
                              <div key={e.l} style={{flex:1,background:'#080d18',borderRadius:4,padding:'4px 5px',border:'1px solid #0d1524',textAlign:'center'}}>
                                <div style={{fontSize:6,color:'#4b5563'}}>{e.l}</div>
                                <div style={{fontSize:8,color:e.v&&e.v<s.price?'#00ff88':'#ff4d4d'}}>${e.v}</div>
                              </div>
                            ))}
                          </div>
                          {(s.signal==='BUY'||s.signal==='WATCH')&&(
                            <button onClick={()=>addTrade(s)} disabled={already} style={{width:'100%',padding:'6px',background:already?'transparent':'rgba(0,255,136,.08)',border:`1px solid ${already?'#1e2a3a':'rgba(0,255,136,.25)'}`,color:already?'#374151':'#00ff88',borderRadius:6,cursor:already?'default':'pointer',fontSize:9,fontWeight:600,letterSpacing:1}}>
                              {already?'✓ موجود':'+ أضف لصفقاتي'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {tab==='trades'&&(
              <div style={{display:'flex',flexDirection:'column',gap:9}}>
                {trades.length===0?<div style={{textAlign:'center',padding:'50px',color:'#1e2a3a',fontSize:11,letterSpacing:2}}>لا توجد صفقات مفتوحة<br/><span style={{fontSize:9,display:'block',marginTop:6}}>اضغط "+ أضف لصفقاتي" في الإشارات</span></div>:trades.map(t=>{
                  const pnl=parseFloat(((t.currentPrice-t.entryHigh)/t.entryHigh*100).toFixed(2))
                  const isA=['EXIT_NOW','TARGET1_HIT','STOP_HIT'].includes(t.status)
                  const sc=isA?'#ff4d4d':'#00ff88'
                  const msg={EXIT_NOW:'⚠ إشارة بيع — افتح عوائد أو أبيان ونفذ البيع الآن',TARGET1_HIT:'🎯 وصل الهدف الأول — يمكنك تثبيت الربح',STOP_HIT:'🛑 وقف الخسارة — يُنصح بالخروج الفوري'}[t.status]
                  return (
                    <div key={t.id} className={isA?'ad':''} style={{background:isA?'rgba(255,77,77,.05)':'rgba(0,255,136,.03)',border:`1px solid ${isA?'rgba(255,77,77,.3)':'rgba(0,255,136,.15)'}`,borderRadius:11,padding:'12px 14px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:9}}>
                        <div style={{display:'flex',alignItems:'center',gap:7}}>
                          <span style={{fontSize:16,fontWeight:700,letterSpacing:2}}>{t.symbol}</span>
                          <span style={{background:`${sc}15`,border:`1px solid ${sc}33`,borderRadius:20,padding:'2px 7px',fontSize:8,color:sc,fontWeight:700}}>{t.status==='OPEN'?'مفتوحة':t.status==='EXIT_NOW'?'⚠ اخرج الآن':t.status==='TARGET1_HIT'?'🎯 الهدف 1':'🛑 وقف'}</span>
                        </div>
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          <span style={{fontSize:7,color:'#374151'}}>{t.openedAt}</span>
                          <button onClick={()=>closeTrade(t.id)} style={{background:'rgba(255,77,77,.08)',border:'1px solid rgba(255,77,77,.25)',color:'#ff4d4d',padding:'2px 8px',borderRadius:4,cursor:'pointer',fontSize:9}}>✕ أغلق</button>
                        </div>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:5}}>
                        {[{l:'سعر الدخول',v:`$${t.entryLow}–$${t.entryHigh}`,c:'#e2e8f0'},{l:'السعر الحالي',v:`$${fmt(t.currentPrice)}`,c:pnl>=0?'#00ff88':'#ff4d4d'},{l:'ربح/خسارة',v:`${pnl>=0?'+':''}${pnl}%`,c:pnl>=0?'#00ff88':'#ff4d4d'},{l:'وقف الخسارة',v:`$${t.stopLoss}`,c:'#ff4d4d'},{l:'الهدف 1',v:`$${t.target1}`,c:'#60a5fa'},{l:'الهدف 2',v:`$${t.target2}`,c:'#a78bfa'},{l:'RSI الحالي',v:t.currentRsi,c:t.currentRsi>60?'#ff4d4d':t.currentRsi<40?'#00ff88':'#fbbf24'},{l:'إشارة الآن',v:SIG[t.currentSignal]?.label??t.currentSignal,c:SIG[t.currentSignal]?.color??'#e2e8f0'}].map(c=>(
                          <div key={c.l} style={{background:'#080d18',borderRadius:6,padding:'6px 7px',border:'1px solid #0d1524'}}>
                            <div style={{fontSize:6,color:'#4b5563',marginBottom:2}}>{c.l}</div>
                            <div style={{fontSize:9,color:c.c,fontWeight:600}}>{c.v}</div>
                          </div>
                        ))}
                      </div>
                      {isA&&<div style={{marginTop:8,background:'rgba(255,77,77,.07)',border:'1px solid rgba(255,77,77,.2)',borderRadius:6,padding:'7px 10px',fontSize:10,color:'#ff4d4d'}}>{msg}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
