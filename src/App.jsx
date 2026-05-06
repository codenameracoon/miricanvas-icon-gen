import { useState, useRef, useCallback } from 'react'
import JSZip from 'jszip'

const STYLES = [
  { id: 'line', label: '라인', color: '#6B7280', prompt: 'minimalist line art icon, single stroke color #333333, strokes-only no fill, stroke-width 4, stroke-linecap round, stroke-linejoin round, transparent background' },
  { id: 'flat', label: '플랫', color: '#3B82F6', prompt: 'flat design icon, bold solid fills only, zero strokes or outlines, max 3 colors from #4A90D9 #F5A623 #7ED321 #FFFFFF, no gradients no shadows' },
  { id: 'filled_line', label: '선채운라인', color: '#10B981', prompt: 'filled line icon: dark outline stroke #333333 stroke-width 3 rounded caps, colorful fill inside shapes, max 4 colors #333333 #5B9BD5 #FFE5A0 #FFFFFF' },
  { id: 'thick_line', label: '두꺼운선', color: '#EF4444', prompt: 'bold thick line icon, single dark color #1A1A1A, stroke-width 9, stroke-linecap round, stroke-linejoin round, no fill at all' },
  { id: 'thin_line', label: '얇은선', color: '#A78BFA', prompt: 'elegant thin line icon, delicate single color #888888, stroke-width 1.5, refined minimal style, no fill' },
]

function normalizeSvg(raw) {
  return raw.replace(/\s+width=["'][^"']*["']/g, '').replace(/\s+height=["'][^"']*["']/g, '').replace('<svg', '<svg width="100%" height="100%"')
}

function ApiKeyScreen({ onSave }) {
  const [key, setKey] = useState('')
  const valid = key.startsWith('sk-ant-') || key.startsWith('sk-')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0A0A' }}>
      <div style={{ width: 400, padding: 36, background: '#111', borderRadius: 16, border: '1px solid #1E1E1E' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ color: '#00C896', fontSize: 20 }}>✦</span>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#F0F0F0' }}>미리캔버스 아이콘 생성기</h1>
        </div>
        <p style={{ fontSize: 13, color: '#666', lineHeight: 1.7, marginBottom: 24 }}>
          Anthropic API 키를 입력해주세요.{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: '#00C896', textDecoration: 'none' }}>console.anthropic.com</a>에서 발급받을 수 있어요.
        </p>
        <input type="password" placeholder="sk-ant-..." value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && valid && onSave(key)} style={{ marginBottom: 12 }} />
        <button onClick={() => valid && onSave(key)} disabled={!valid} style={{ width: '100%', padding: 11, borderRadius: 9, border: 'none', background: valid ? '#00C896' : '#1A1A1A', color: valid ? '#000' : '#444', fontWeight: 700, fontSize: 14, cursor: valid ? 'pointer' : 'not-allowed' }}>시작하기</button>
        <p style={{ fontSize: 11, color: '#333', textAlign: 'center', marginTop: 14 }}>키는 브라우저 메모리에만 저장되며 외부로 전송되지 않습니다.</p>
      </div>
    </div>
  )
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('miri_api_key') || '')
  const [theme, setTheme] = useState('')
  const [selStyles, setSelStyles] = useState(['line'])
  const [refImg, setRefImg] = useState(null)
  const [icons, setIcons] = useState([])
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState({ n: 0, total: 0, label: '' })
  const [err, setErr] = useState(null)
  const fileRef = useRef(null)
  const saveKey = useCallback(key => { localStorage.setItem('miri_api_key', key); setApiKey(key) }, [])
  const clearKey = () => { localStorage.removeItem('miri_api_key'); setApiKey('') }
  if (!apiKey) return <ApiKeyScreen onSave={saveKey} />
  const toggleStyle = id => setSelStyles(prev => prev.includes(id) ? (prev.length > 1 ? prev.filter(s => s !== id) : prev) : [...prev, id])
  const onFile = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setRefImg({ preview: ev.target.result, b64: ev.target.result.split(',')[1], mime: f.type }); r.readAsDataURL(f) }
  const callAPI = async (messages, maxTokens = 2000) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: 'claude-opus-4-5-20251101', max_tokens: maxTokens, messages }) })
    const data = await res.json(); if (data.error) throw new Error(data.error.message)
    return data.content.find(b => b.type === 'text')?.text || ''
  }
  const run = async () => {
    if (!theme.trim() || busy) return
    setErr(null); setIcons([]); setBusy(true)
    try {
      setProg({ n: 0, total: 20, label: '아이콘 목록 생성 중...' })
      const ideaText = `"${theme}" 주제의 SVG 아이콘 20가지 아이디어. 각 아이콘은 단일 객체. JSON 배열만: [{"subject":"커피잔","elementName":"커피잔 아이콘","keywords":"커피,coffee,음료,카페"}]`
      const ideaMsg = refImg ? [{ type: 'image', source: { type: 'base64', media_type: refImg.mime, data: refImg.b64 } }, { type: 'text', text: ideaText + '\n참고 이미지 분위기 반영.' }] : ideaText
      const rawIdeas = await callAPI([{ role: 'user', content: ideaMsg }], 1200)
      const jsonMatch = rawIdeas.match(/\[[\s\S]*?\]/); if (!jsonMatch) throw new Error('목록 생성 실패')
      const ideas = JSON.parse(jsonMatch[0]).slice(0, 20)
      for (let i = 0; i < ideas.length; i++) {
        const { subject, elementName, keywords } = ideas[i]
        const style = STYLES.find(s => s.id === selStyles[i % selStyles.length])
        setProg({ n: i + 1, total: ideas.length, label: `${subject} 생성 중...` })
        const svgPrompt = `SVG icon of "${subject}". Style: ${style.prompt}. viewBox="0 0 100 100", single object, 10px padding, no background. Output ONLY <svg...></svg>.`
        const svgMsg = refImg ? [{ type: 'image', source: { type: 'base64', media_type: refImg.mime, data: refImg.b64 } }, { type: 'text', text: svgPrompt + ' Match reference style.' }] : svgPrompt
        try { const txt = await callAPI([{ role: 'user', content: svgMsg }], 2000); const m = txt.match(/<svg[\s\S]*?<\/svg>/); if (m) setIcons(prev => [...prev, { id: i, filename: `${theme}_${subject}_${style.id}`, subject, elementName, keywords, styleId: style.id, styleLabel: style.label, svg: normalizeSvg(m[0]) }]) } catch (_) {}
        await new Promise(r => setTimeout(r, 100))
      }
    } catch (e) { setErr(e.message) }
    setBusy(false); setProg({ n: 0, total: 0, label: '' })
  }
  const downloadZip = async () => {
    if (!icons.length) return
    const zip = new JSZip()
    icons.forEach(ic => zip.file(`${ic.filename}.svg`, ic.svg))
    const hdr = 'fileName,uniqueId,elementName,keywords,tier,contentType\n'
    const rows = icons.map(ic => `${ic.filename},,${ic.elementName},"${ic.keywords}",Standard,SVG element`).join('\n')
    zip.file('metadata.csv', '\uFEFF' + hdr + rows)
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${theme}_아이콘_${icons.length}개.zip` })
    a.click(); URL.revokeObjectURL(a.href)
  }
  const pct = prog.total ? Math.round((prog.n / prog.total) * 100) : 0
  const canRun = !busy && theme.trim()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0A0A0A' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #1A1A1A', background: '#0D0D0D', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: '#00C896', fontSize: 18 }}>✦</span><span style={{ fontWeight: 700, fontSize: 16 }}>미리캔버스 아이콘 생성기</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {icons.length > 0 && !busy && <button onClick={downloadZip} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #00C896', background: 'transparent', color: '#00C896', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⬇ ZIP 다운로드 ({icons.length}개)</button>}
          <button onClick={clearKey} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #222', background: 'transparent', color: '#444', fontSize: 12, cursor: 'pointer' }}>API 키 변경</button>
        </div>
      </header>
      <div style={{ display: 'flex', flex: 1 }}>
        <aside style={{ width: 236, borderRight: '1px solid #1A1A1A', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 22, background: '#0D0D0D', flexShrink: 0, overflowY: 'auto' }}>
          <section><p style={{ fontSize: 11, fontWeight: 600, color: '#444', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>주제</p><input type="text" value={theme} onChange={e => setTheme(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()} placeholder="카페, 크리스마스, 운동..." /></section>
          <section>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#444', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>스타일</p>
            {STYLES.map(s => { const on = selStyles.includes(s.id); return (<button key={s.id} onClick={() => toggleStyle(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', marginBottom: 4, borderRadius: 8, border: on ? `1px solid ${s.color}55` : '1px solid transparent', background: on ? `${s.color}12` : 'transparent', cursor: 'pointer', textAlign: 'left' }}><span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: on ? s.color : '#2A2A2A' }} /><span style={{ fontSize: 13, color: on ? '#F0F0F0' : '#555', fontWeight: on ? 600 : 400 }}>{s.label}</span>{on && selStyles.length > 1 && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#444' }}>{Math.round(20 / selStyles.length)}개</span>}</button>) })}
            {selStyles.length > 1 && <p style={{ fontSize: 11, color: '#3A3A3A', marginTop: 4 }}>20개를 {selStyles.length}가지 스타일로 분배</p>}
          </section>
          <section>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#444', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>레퍼런스 이미지</p>
            <div onClick={() => fileRef.current.click()} style={{ border: '1px dashed #2A2A2A', borderRadius: 8, padding: 16, cursor: 'pointer', textAlign: 'center', background: '#141414' }}>
              {refImg ? (<><img src={refImg.preview} alt="ref" style={{ maxWidth: '100%', maxHeight: 90, borderRadius: 6, objectFit: 'contain' }} /><p style={{ fontSize: 11, color: '#444', marginTop: 6 }}>클릭해서 변경</p></>) : (<><div style={{ fontSize: 24, marginBottom: 6 }}>🖼</div><p style={{ fontSize: 11, color: '#3A3A3A' }}>선택 사항</p></>)}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
            {refImg && <button onClick={() => { setRefImg(null); fileRef.current.value = '' }} style={{ fontSize: 11, color: '#444', background: 'none', border: 'none', cursor: 'pointer', marginTop: 6 }}>이미지 제거</button>}
          </section>
          <button onClick={run} disabled={!canRun} style={{ padding: '12px', borderRadius: 10, border: 'none', background: canRun ? '#00C896' : '#181818', color: canRun ? '#000' : '#2A2A2A', fontWeight: 700, fontSize: 14, cursor: canRun ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            {busy ? <><span style={{ display: 'inline-block', animation: 'spin .9s linear infinite' }}>⟳</span> 생성 중...</> : <>✦ CREATE</>}
          </button>
          {err && <p style={{ fontSize: 12, color: '#FF6B6B' }}>{err}</p>}
        </aside>
        <main style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {busy && (<div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ fontSize: 12, color: '#666' }}>{prog.label}</span><span style={{ fontSize: 12, color: '#00C896', fontWeight: 600 }}>{prog.n}/{prog.total}</span></div><div style={{ height: 3, background: '#1A1A1A', borderRadius: 2 }}><div style={{ height: '100%', width: `${pct}%`, background: '#00C896', borderRadius: 2, transition: 'width .3s ease' }} /></div></div>)}
          {!busy && icons.length === 0 && (<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 400, color: '#2A2A2A', gap: 12 }}><div style={{ fontSize: 48 }}>⬡</div><p style={{ fontSize: 14 }}>주제를 입력하고 CREATE를 눌러주세요</p></div>)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
            {icons.map((icon, i) => (<div key={i} style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: 12, overflow: 'hidden' }}><div style={{ aspectRatio: '1', padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }} dangerouslySetInnerHTML={{ __html: icon.svg }} /><div style={{ padding: '6px 10px' }}><p style={{ fontSize: 11, fontWeight: 600, color: '#CCC', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{icon.subject}</p><p style={{ fontSize: 10, color: '#3A3A3A', margin: '2px 0 0' }}>{icon.styleLabel}</p></div></div>))}
            {busy && Array.from({ length: Math.max(0, 20 - icons.length) }).map((_, i) => (<div key={`ph-${i}`} style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: 12, aspectRatio: '1.1', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.05}s` }} />))}
          </div>
        </main>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
