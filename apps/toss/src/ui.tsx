import type { ReactNode } from 'react';
import { theme } from './theme';

export function Badge({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return <span style={{ display:'inline-flex', alignItems:'center', height:22, padding:'0 8px', borderRadius:6,
    fontSize:12, fontWeight:600, lineHeight:1, color: accent?theme.accent:theme.textMuted,
    background: accent?theme.accentSoft:'rgba(255,255,255,0.07)' }}>{children}</span>;
}

export function SearchBar({ value, onChange, placeholder }: { value:string; onChange:(v:string)=>void; placeholder?:string }) {
  return <div style={{ position:'relative' }}>
    <span aria-hidden style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:theme.textMuted }}>🔍</span>
    <input className="field" value={value} placeholder={placeholder||'검색'} onChange={(e)=>onChange(e.target.value)} aria-label="검색" />
  </div>;
}

export function Chips({ items, active, onPick }: { items:string[]; active:string; onPick:(v:string)=>void }) {
  return <div className="chips">
    {items.map((c)=>{ const on=c===active; return (
      <button key={c} type="button" onClick={()=>onPick(c)} className="pressable" style={{ flexShrink:0, height:34, padding:'0 14px',
        borderRadius:999, fontSize:14, fontWeight:600, cursor:'pointer', border: on?'none':'1px solid rgba(255,255,255,0.1)',
        background: on?theme.accent:'transparent', color: on?theme.accentInk:theme.textMuted }}>{c}</button>); })}
  </div>;
}

export function Cover({ gradient, src, alt, height=150, radius=12 }: { gradient?: string[]; src?: string|null; alt:string; height?:number; radius?:number }) {
  const grad = gradient && gradient.length>=2 ? `linear-gradient(140deg, ${gradient[0]}, ${gradient[1]})` : theme.surfaceAlt;
  return <div style={{ height, borderRadius:radius, overflow:'hidden', background:grad, flexShrink:0 }}>
    {src ? <img src={src} alt={alt} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover' }}
      onError={(e)=>{ (e.currentTarget as HTMLImageElement).style.display='none'; }} /> : null}
  </div>;
}

export function StatStrip({ stats }: { stats: { label:string; value:string }[] }) {
  if (!stats.length) return null;
  return <div style={{ display:'flex', gap:10, padding:'14px 0', borderTop:`1px solid ${theme.border}`, borderBottom:`1px solid ${theme.border}` }}>
    {stats.map((s)=>(<div key={s.label} style={{ flex:1, textAlign:'center' }}>
      <div style={{ fontSize:18, fontWeight:800 }}>{s.value}</div>
      <div style={{ fontSize:12, color:theme.textMuted, marginTop:3 }}>{s.label}</div>
    </div>))}
  </div>;
}
