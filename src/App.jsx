import React, { useMemo, useRef, useState } from 'react'
import Icon from './components/Icon'
import { AreaChart, Bars, DonutChart } from './components/Charts'
import { EmptyState, MetricCard, Panel, PanelHeader, SectionHeader, StatusBadge } from './components/Ui'
import { useDashboardData } from './hooks/useDashboardData'

const navItems = [
  { id: 'overview', label: 'Ümumi baxış', icon: 'grid' },
  { id: 'map', label: 'GIS xəritə', icon: 'map' },
  { id: 'before-after', label: 'Before / After', icon: 'route' },
  { id: 'connections', label: 'Prioritet bağlantılar', icon: 'route' },
  { id: 'hubs', label: 'Optimal hablar', icon: 'pin' },
  { id: 'finance', label: 'Maliyyə', icon: 'wallet' }
]

const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('az-AZ', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const money = (value) => `${fmt(value)} ₼`
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
const downloadCsv = (filename, rows) => {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const content = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
  ].join('\r\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const openMap = () => window.open('/processed/xerite_after.html', '_blank', 'noopener,noreferrer')
const phaseKeys = ['ƏVVƏL', 'İNDİ', 'GƏLƏCƏK']

function App() {
  const { data, loading, error } = useDashboardData()
  const [activeView, setActiveView] = useState('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) return <div className="loading-screen"><div className="loading-mark">AXIN</div><div className="loader" /><p>Dashboard məlumatları hazırlanır…</p></div>
  if (error || !data) return <div className="loading-screen error-screen"><div className="loading-mark">AXIN</div><h2>Data yüklənmədi</h2><p>{error || 'Naməlum xəta'}</p><small>Frontend-i `frontend` qovluğundan Vite ilə işə saldığınıza əmin olun.</small></div>

  const { summary, connections, hubs, finance } = data
  const viewTitle = navItems.find((item) => item.id === activeView)?.label ?? 'Ümumi baxış'

  const handleNavClick = (viewId) => {
    setActiveView(viewId)
    setSidebarOpen(false)
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">A</div><div className="brand-copy"><strong>AXIN</strong><span>Mobility intelligence</span></div><button className="sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Sidebarı aç' : 'Sidebarı bağla'} title={sidebarCollapsed ? 'Sidebarı aç' : 'Sidebarı bağla'}><Icon name="chevron" size={17} /></button><button className="close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Menyunu bağla">×</button></div>
      <div className="workspace-switch"><span className="workspace-dot" /><div><small>WORKSPACE</small><b>Bakı şəhəri</b></div><Icon name="chevron" size={15} /></div>
      <nav className="main-nav"><span className="nav-caption">İCMAL</span>{navItems.map((item) => <button key={item.id} className={activeView === item.id ? 'active' : ''} data-tooltip={item.label} aria-label={item.label} onClick={() => handleNavClick(item.id)}><Icon name={item.icon} size={18} /><span>{item.label}</span>{item.id === 'connections' && <em>{connections.filter((row) => row.selected).length}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="status-card" data-tooltip="Live data layer"><span className="live-dot" /><div><b>Live data layer</b><small>17 oktyabr 2026</small></div></div><div className="user-card" data-tooltip="AYNA analitika"><div className="avatar">AY</div><div><b>AYNA analitika</b><small>Admin workspace</small></div><Icon name="user" size={20} /></div></div>
    </aside>
    {sidebarOpen && <button className="sidebar-backdrop" aria-label="Menyunu bağla" onClick={() => setSidebarOpen(false)} />}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Icon name="grid" size={20} /></button><div className="breadcrumb"><span>AXIN /</span><b>{viewTitle}</b></div><div className="top-actions"><div className="top-search"><Icon name="search" size={16} /><span>Dashboardda axtar…</span><kbd>⌘ K</kbd></div><div className="top-avatar">AY</div></div></header>
      <div className="content-wrap">
        {activeView === 'overview' && <Overview summary={summary} connections={connections} hubs={hubs} finance={finance} />}
        {activeView === 'map' && <MapView summary={summary} />}
        {activeView === 'before-after' && <BeforeAfterView summary={summary} />}
        {activeView === 'connections' && <ConnectionsView connections={connections} />}
        {activeView === 'hubs' && <HubsView hubs={hubs} />}
        {activeView === 'finance' && <FinanceView summary={summary} finance={finance} />}
      </div>
    </main>
  </div>
}

function Overview({ summary, connections, hubs, finance }) {
  const phases = summary.phases
  const current = phases['İNDİ']
  const future = phases['GƏLƏCƏK']
  const scenarioYear = current.label.match(/\b\d{4}\b/)?.[0] ?? 'İNDİ'
  const selectedConnections = connections.filter((row) => row.selected)
  const selectedHubs = hubs.filter((row) => row.selected).sort((a, b) => a.rank - b.rank)
  const financeTop = finance.slice().sort((a, b) => b['cəmi_azn'] - a['cəmi_azn']).slice(0, 5).map((row) => ({ label: row['maddə'], value: row['cəmi_azn'] }))
  const coverageChange = ((future.coverage_pct - current.coverage_pct) / current.coverage_pct * 100).toFixed(1)
  const reportRows = [
    { göstərici: 'Mövcud velo zolağı', dəyər: `${fmt(current.lanes_km, 1)} km`, qeyd: 'İndiki vəziyyət' },
    { göstərici: 'Gələcək velo zolağı', dəyər: `${fmt(future.lanes_km, 1)} km`, qeyd: 'İnkişaf ssenarisi' },
    { göstərici: 'Ümumi kapital xərci', dəyər: money(summary.capex_azn), qeyd: 'AZN' },
    { göstərici: 'Təxmini icra müddəti', dəyər: `${summary.months} ay`, qeyd: 'İnkişaf ssenarisi' },
    { göstərici: 'Yeni qoşulan məntəqə', dəyər: `+${summary.newly_connected}`, qeyd: 'Məntəqə' }
  ]
  return <>
    <SectionHeader eyebrow="AYNA · QƏRAR MƏRKƏZİ" title="Bakı mikromobillik şəbəkəsi" description={`Mövcud vəziyyəti, investisiya prioritetlərini və ${scenarioYear} inkişaf ssenarisini bir ekranda izləyin.`} action={<div className="header-actions"><button className="secondary-button" type="button" onClick={() => downloadCsv('axin-umumi-hesabat.csv', reportRows)}><Icon name="download" size={15} /> Hesabatı yüklə</button><span className="primary-button scenario-status" role="status"><span className="live-dot" /> Ssenari aktivdir</span></div>} />
    <div className="hero-banner">
      <div className="hero-copy">
        <span className="eyebrow mint">{scenarioYear} İNKİŞAF SSENARİSİ</span>
        <h1>Şəbəkəni birləşdir,<br /><em>şəhəri hərəkətə gətir.</em></h1>
        <p>AXIN analitikası mövcud {fmt(current.lanes_km, 1)} km şəbəkəni {fmt(future.lanes_km, 1)} km vahid şəbəkəyə çevirmək üçün ən yüksək təsirli bağlantıları seçib.</p>
        <div className="hero-meta">
          <div><b>{money(summary.capex_azn)}</b><span>ümumi kapital xərci</span></div>
          <div><b>{summary.months} ay</b><span>təxmini icra müddəti</span></div>
          <div><b>+{summary.newly_connected}</b><span>yeni qoşulan məntəqə</span></div>
        </div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="network-map" />
        <div className="network-orbit orbit-one" />
        <div className="network-orbit orbit-two" />
        <div className="network-core"><Icon name="bike" size={34} /><strong>{fmt(future.lanes_km, 1)} km</strong><span>Ümumi velosiped zolağı</span></div>
        <span className="node n1" /><span className="node n2" /><span className="node n3" /><span className="node n4" />
      </div>
    </div>
    <div className="metric-grid"><MetricCard label="Mövcud velo zolağı" value={`${fmt(current.lanes_km, 1)} km`} change={`+${fmt(future.lanes_km - current.lanes_km, 1)} km`} changeLabel="ssenari sonrası" tone="purple" icon="route" /><MetricCard label="Şəbəkə əhatəsi" value={`${fmt(current.coverage_pct, 1)}%`} change={`+${fmt(future.coverage_pct - current.coverage_pct, 1)}%`} changeLabel={`gələcək · ${coverageChange}% artım`} tone="mint" icon="map" /><MetricCard label="Əlaqəsiz məntəqə" value={fmt(current.disconnected)} change={`-${fmt(current.disconnected - future.disconnected)}`} changeLabel="ssenari sonrası" tone="orange" icon="pin" /><MetricCard label="İllik texniki xidmət" value={money(summary.maintenance_azn_year)} change="8 ay" changeLabel="icra müddəti" tone="blue" icon="wallet" /></div>
    <div className="dashboard-grid overview-grid"><Panel className="coverage-panel"><PanelHeader title="Şəbəkə əhatəsi" subtitle="Əvvəl → indi → inkişaf ssenarisi" action={<StatusBadge tone="mint">+{fmt(future.coverage_pct - current.coverage_pct, 1)} pp</StatusBadge>} /><AreaChart values={phaseKeys.map((key) => phases[key].coverage_pct)} labels={['2025', '2026', 'Ssenari']} /><div className="chart-footnote"><span><i className="legend-dot purple" />Zolaqdan 300 m-də yaşayan sakin</span><b>{fmt(future.coverage_pop)} nəfər</b></div></Panel><Panel><PanelHeader title="İnvestisiya bölgüsü" subtitle="Prioritet istiqamətlər üzrə" /><DonutChart segments={financeTop.slice(0, 4)} centerValue={money(summary.capex_azn)} centerLabel="ümumi" /></Panel><Panel className="wide-panel"><PanelHeader title="Prioritet bağlantılar" subtitle={`${selectedConnections.length} istiqamət seçilib · fayda/xərc nisbətinə görə`} /><div className="priority-table"><div className="priority-head"><span>İSTİQAMƏT</span><span>UZUNLUQ</span><span>YENİ MƏNTƏQƏ</span><span>XƏRC</span><span>STATUS</span></div>{selectedConnections.slice(0, 5).map((row) => <div className="priority-row" key={row.id}><div><strong>{row.name}</strong><small>{row.from} → {row.to}</small></div><b>{fmt(row.length_km, 2)} km</b><b>{row.newly_connected}</b><b>{money(row.cost_azn)}</b><StatusBadge tone="mint">Seçildi</StatusBadge></div>)}</div></Panel><Panel className="wide-panel hub-panel"><PanelHeader title="Optimal hublar" subtitle="Şəbəkə və ictimai nəqliyyatın inteqrasiya nöqtələri" /><div className="hub-list">{selectedHubs.slice(0, 4).map((hub) => <div className="hub-item" key={hub.name}><span className="hub-rank">0{hub.rank}</span><div className="hub-main"><strong>{hub.name}</strong><span><Icon name="route" size={13} /> {hub.n_lines} avtobus xətti <i /> <Icon name="pin" size={13} /> {hub.parkings} məntəqə</span></div><div className="hub-pop"><b>{fmt(hub.pop)}</b><span>500 m-də sakin</span></div><Icon name="chevron" size={16} className="muted-icon" /></div>)}</div></Panel></div>
  </>
}

function MapView({ summary }) {
  const future = summary.phases['GƏLƏCƏK']
  const mapFrame = useRef(null)
  const [layers, setLayers] = useState({ existing: true, proposed: true, disconnected: true, hubs: true })
  const layerDefinitions = [
    { key: 'existing', label: 'Mövcud zolaq', marker: 'map-line existing' },
    { key: 'proposed', label: 'Yeni bağlantı', marker: 'map-line proposed' },
    { key: 'disconnected', label: 'Əlaqəsiz məntəqə', marker: 'map-dot disconnected' },
    { key: 'hubs', label: 'Optimal hub', marker: 'map-dot hub' }
  ]
  const toggleLayer = (definition) => {
    const nextVisible = !layers[definition.key]
    mapFrame.current?.contentWindow?.postMessage({ type: 'axin-layer-toggle', layer: definition.key, visible: nextVisible }, '*')
    setLayers((current) => ({ ...current, [definition.key]: nextVisible }))
  }
  const syncLayers = () => Object.entries(layers).forEach(([layer, visible]) => mapFrame.current?.contentWindow?.postMessage({ type: 'axin-layer-toggle', layer, visible }, '*'))
  return <><SectionHeader eyebrow="GIS ANALİTİKA" title="Şəbəkə xəritəsi" description="Layer-ləri seçərək mövcud və təklif olunan infrastrukturu ayrıca analiz edin." action={<div className="header-actions"><button className="primary-button" type="button" onClick={openMap}><Icon name="external" size={15} /> Tam xəritəni aç</button></div>} /><Panel className="map-panel"><div className="map-toolbar"><div className="map-legend">{layerDefinitions.map((definition) => <button type="button" className={`map-layer-toggle ${layers[definition.key] ? 'active' : 'inactive'}`} key={definition.key} onClick={() => toggleLayer(definition)} aria-pressed={layers[definition.key]}><span className="layer-check">{layers[definition.key] ? <Icon name="check" size={14} /> : <span />}</span><i className={definition.marker} /><span>{definition.label}</span></button>)}</div><StatusBadge tone="purple">Vahid şəbəkə · {future.lanes_km} km</StatusBadge></div><div className="map-frame"><iframe ref={mapFrame} onLoad={syncLayers} title="AXIN xəritəsi" src="/processed/xerite_after.html" /></div><div className="map-footer"><span><b>{future.network_parts}</b> şəbəkə hissəsi</span><span><b>{future.hubs}</b> optimal hub</span><span><b>{future.disconnected}</b> əlaqəsiz məntəqə</span><span className="map-note">Xəritə: OSM + hakaton dataları</span></div></Panel></>
}

function BeforeAfterView({ summary }) {
  const before = summary.phases['ƏVVƏL']
  const after = summary.phases['GƏLƏCƏK']
  const comparison = [
    { label: 'Velo zolaqları', before: `${fmt(before.lanes_km, 1)} km`, after: `${fmt(after.lanes_km, 1)} km` },
    { label: 'Şəbəkə əhatəsi', before: `${fmt(before.coverage_pct, 1)}%`, after: `${fmt(after.coverage_pct, 1)}%` },
    { label: 'Əlaqəsiz məntəqə', before: fmt(before.disconnected), after: fmt(after.disconnected) },
    { label: 'Şəbəkə hissələri', before: before.network_parts, after: after.network_parts }
  ]
  return <><SectionHeader eyebrow="SENARİ ANALİZİ" title="Before / After" description="2025-ci ildəki mövcud vəziyyət ilə AXIN inkişaf ssenarisinin şəhər şəbəkəsinə təsirini yan-yana müqayisə edin." action={<StatusBadge tone="mint">+{fmt(after.lanes_km - before.lanes_km, 1)} km · vahid şəbəkə</StatusBadge>} /><div className="comparison-grid">{comparison.map((item) => <div className="comparison-stat" key={item.label}><span>{item.label}</span><div><b>{item.before}</b><Icon name="chevron" size={14} /><strong>{item.after}</strong></div></div>)}</div><div className="before-after-grid"><Panel className="compare-panel"><div className="compare-heading"><div><span className="eyebrow">ƏVVƏL · 2025</span><h3>Mövcud şəbəkə</h3></div><StatusBadge tone="gray">{before.network_parts} hissə</StatusBadge></div><div className="compare-map"><iframe title="2025 mövcud şəbəkə xəritəsi" src="/processed/xerite_before.html" /></div><div className="compare-footer"><span><b>{fmt(before.lanes_km, 1)} km</b> zolaq</span><span><b>{fmt(before.disconnected)}</b> əlaqəsiz məntəqə</span><span><b>{fmt(before.coverage_pct, 1)}%</b> əhatə</span></div></Panel><Panel className="compare-panel after"><div className="compare-heading"><div><span className="eyebrow mint">SONRA · SSENARİ</span><h3>Vahid inkişaf şəbəkəsi</h3></div><StatusBadge tone="mint">{after.network_parts} hissə</StatusBadge></div><div className="compare-map"><iframe title="İnkişaf ssenarisi xəritəsi" src="/processed/xerite_after.html" /></div><div className="compare-footer"><span><b>{fmt(after.lanes_km, 1)} km</b> zolaq</span><span><b>{fmt(after.disconnected)}</b> əlaqəsiz məntəqə</span><span><b>{fmt(after.coverage_pct, 1)}%</b> əhatə</span></div></Panel></div></>
}

function ConnectionsView({ connections }) {
  const [query, setQuery] = useState('')
  const [onlySelected, setOnlySelected] = useState(true)
  const filtered = useMemo(() => connections.filter((row) => (!onlySelected || row.selected) && `${row.id} ${row.name} ${row.from} ${row.to}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.azn_per_benefit - b.azn_per_benefit), [connections, onlySelected, query])
  return <><SectionHeader eyebrow="INVESTİSİYA PRIORİTETLƏRİ" title="Prioritet bağlantılar" description="Hər istiqamətin təsiri, xərci və şəbəkə funksiyasını müqayisə edin." action={<button className="secondary-button" type="button" onClick={() => downloadCsv('axin-prioritet-baglantilar.csv', filtered)}><Icon name="download" size={15} /> CSV yüklə</button>} /><div className="filter-row"><div className="input-search"><Icon name="search" size={16} /><input placeholder="İstiqamət və ya küçə axtar…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><button type="button" className={`filter-toggle ${onlySelected ? 'active' : ''}`} onClick={() => setOnlySelected((value) => !value)}><Icon name="check" size={15} /> Yalnız seçilənlər</button><span className="result-count">{filtered.length} nəticə</span></div><Panel className="table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>ID</th><th>İstiqamət</th><th>Uzunluq</th><th>Yeni məntəqə</th><th>Şəbəkə təsiri</th><th>Xərc</th><th>₼ / fayda</th><th>Status</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><span className="table-id">{row.id}</span></td><td><strong>{row.name}</strong><small>{row.from} → {row.to}</small></td><td>{fmt(row.length_km, 2)} km</td><td><b className="accent-number">+{row.newly_connected}</b></td><td>{row.merges_network ? <StatusBadge tone="purple">Şəbəkəni birləşdirir</StatusBadge> : row.links_transit_hub ? <StatusBadge tone="blue">Nəqliyyat qovşağı</StatusBadge> : <span className="muted-text">Lokal bağlantı</span>}</td><td>{money(row.cost_azn)}</td><td>{money(row.azn_per_benefit)}</td><td><StatusBadge tone={row.selected ? 'mint' : 'gray'}>{row.selected ? 'Seçildi' : 'Gözləmə'}</StatusBadge></td></tr>)}</tbody></table></div></Panel></>
}

function HubsView({ hubs }) {
  const selected = hubs.filter((hub) => hub.selected).sort((a, b) => a.rank - b.rank)
  const candidateRows = hubs.filter((hub) => !hub.selected).sort((a, b) => b.n_lines - a.n_lines)
  const candidates = candidateRows.slice(0, 5)
  return <><SectionHeader eyebrow="İNTEQRASİYA NÖQTƏLƏRİ" title="Optimal hublar" description="Metro, avtovağzal və velosiped məntəqələrini vahid multimodal şəbəkədə birləşdirən seçilmiş nöqtələr." action={<button className="secondary-button" type="button" onClick={() => downloadCsv('axin-hub-namizedleri.csv', candidateRows)}><Icon name="download" size={15} /> Namizəd siyahısı</button>} /><div className="hub-summary-grid"><MetricCard label="Seçilmiş hub" value={selected.length} change={`+${selected.reduce((sum, hub) => sum + hub.n_lines, 0)}`} changeLabel="avtobus xətti əhatəsi" tone="purple" icon="pin" /><MetricCard label="İnteqrasiya olunan məntəqə" value={selected.reduce((sum, hub) => sum + hub.parkings, 0)} change="mövcud" changeLabel="yeni satınalma tələb etmir" tone="mint" icon="bike" /><MetricCard label="500 m-də sakin" value={fmt(selected.reduce((sum, hub) => sum + hub.pop, 0))} change="əhatə" changeLabel="seçilmiş hubların cəmi" tone="orange" icon="map" /></div><div className="dashboard-grid hubs-grid"><Panel className="wide-panel"><PanelHeader title="Seçilmiş hublar" subtitle="Fayda və əlçatanlıq balına görə sıralanıb" /><div className="selected-hubs">{selected.map((hub) => <div className="selected-hub" key={hub.name}><div className="selected-hub-rank">{String(hub.rank).padStart(2, '0')}</div><div className="selected-hub-main"><span className="eyebrow">{hub.kind}</span><h3>{hub.name}</h3><p>{hub.reason}</p><div className="tag-row"><StatusBadge tone="blue">{hub.n_lines} avtobus xətti</StatusBadge><StatusBadge tone="gray">{hub.parkings} məntəqə</StatusBadge><StatusBadge tone="mint">{money(hub.cost_azn)}</StatusBadge></div></div><div className="hub-score"><b>{fmt(hub.pop)}</b><span>potensial sakin</span><div className="score-line"><i style={{ width: `${Math.min((hub.pop / 18000) * 100, 100)}%` }} /></div></div></div>)}</div></Panel><Panel><PanelHeader title="Güclü namizədlər" subtitle="Seçilməyən, amma yüksək xətt sıxlığı olan nöqtələr" /><Bars items={candidates.map((hub) => ({ label: hub.name.replace(' metro', ''), value: hub.n_lines }))} formatter={(value) => `${value} xətt`} color="#36b7d8" /></Panel></div></>
}

function FinanceView({ summary, finance }) {
  const [expenseView, setExpenseView] = useState('list')
  const max = Math.max(...finance.map((row) => row['cəmi_azn']))
  const expenseSegments = finance.map((row) => ({ label: row['maddə'], value: Number(row['cəmi_azn']) || 0 }))
  const expenseTotal = expenseSegments.reduce((sum, segment) => sum + segment.value, 0)

  return <>
    <SectionHeader eyebrow="MALİYYƏ VƏ İCRA" title="İnvestisiya planı" description="İnkişaf ssenarisinin kapital xərci, qənaəti və mərhələli icra çərçivəsi." action={<button className="secondary-button" type="button" onClick={() => downloadCsv('axin-maliyye-hesabati.csv', finance)}><Icon name="download" size={15} /> Maliyyə hesabatı</button>} />
    <div className="finance-hero"><div><span className="eyebrow mint">ÜMUMİ KAPİTAL XƏRCİ</span><h1>{money(summary.capex_azn)}</h1><p>Seçilmiş {summary.selected_km} km bağlantı, {summary.phases['GƏLƏCƏK'].hubs} hub və rəqəmsal platforma.</p></div><div className="finance-hero-stats"><div><b>{money(summary.saving_lanes_azn + summary.saving_parking_azn)}</b><span>mövcud infrastrukturla qənaət</span></div><div><b>{money(summary.azn_per_new_connection)}</b><span>1 yeni məntəqə / bağlantı</span></div><div><b>{summary.months} ay</b><span>təxmini icra</span></div></div></div>
    <div className="dashboard-grid finance-grid">
      <Panel className="wide-panel">
        <PanelHeader title="Xərc maddələri" subtitle="Bütün məbləğlər AZN ilə" action={<div className="finance-panel-actions"><div className="expense-view-toggle" role="group" aria-label="Xərc görünüşü"><button type="button" className={expenseView === 'list' ? 'active' : ''} aria-pressed={expenseView === 'list'} onClick={() => setExpenseView('list')}><Icon name="list" size={15} /> Siyahı</button><button type="button" className={expenseView === 'chart' ? 'active' : ''} aria-pressed={expenseView === 'chart'} onClick={() => setExpenseView('chart')}><Icon name="chart" size={15} /> Qrafik</button></div></div>} />
        {expenseView === 'list' ? <div className="finance-bars">{finance.map((row) => <div className="finance-bar" key={row['maddə']}><div className="finance-bar-top"><span>{row['maddə']}</span><b>{money(row['cəmi_azn'])}</b></div><div className="finance-track"><i style={{ width: `${(row['cəmi_azn'] / max) * 100}%` }} /></div><small>{fmt(row.miqdar, 2)} {row.vahid} × {money(row['vahid_qiymət_azn'])}</small></div>)}</div> : <DonutChart className="finance-donut" segments={expenseSegments} centerValue={money(expenseTotal)} centerLabel="ümumi xərc" />}
      </Panel>
      <Panel><PanelHeader title="İcra mərhələləri" subtitle="Təxmini timeline" /><div className="timeline"><div className="timeline-item"><span className="timeline-dot done" /><div><b>Hazırlıq və layihələndirmə</b><small>Ay 1–2 · 2 ay</small></div></div><div className="timeline-item"><span className="timeline-dot current" /><div><b>Prioritet bağlantıların icrası</b><small>Ay 3–6 · 4 ay</small></div></div><div className="timeline-item"><span className="timeline-dot future" /><div><b>Hub və platforma inteqrasiyası</b><small>Ay 7–8 · 2 ay</small></div></div></div><div className="savings-card"><span className="eyebrow">QƏNAƏT</span><b>{money(summary.saving_lanes_azn + summary.saving_parking_azn)}</b><p>Rənglənmiş zolaq və mövcud məntəqələrin təkrar istifadəsi.</p></div></Panel>
    </div>
  </>
}

export default App
