import React, { useMemo, useState } from 'react'
import Icon from './components/Icon'
import { AreaChart, Bars, DonutChart } from './components/Charts'
import { EmptyState, MetricCard, Panel, PanelHeader, SectionHeader, StatusBadge } from './components/Ui'
import { useDashboardData } from './hooks/useDashboardData'

const navItems = [
  { id: 'overview', label: 'Ümumi baxış', icon: 'grid' },
  { id: 'map', label: 'GIS xəritə', icon: 'map' },
  { id: 'connections', label: 'Prioritet bağlantılar', icon: 'route' },
  { id: 'hubs', label: 'Optimal hablar', icon: 'pin' },
  { id: 'finance', label: 'Maliyyə', icon: 'wallet' }
]

const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('az-AZ', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const money = (value) => `${fmt(value)} ₼`
const phaseKeys = ['ƏVVƏL', 'İNDİ', 'GƏLƏCƏK']

function App() {
  const { data, loading, error } = useDashboardData()
  const [activeView, setActiveView] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) return <div className="loading-screen"><div className="loading-mark">AXIN</div><div className="loader" /><p>Dashboard məlumatları hazırlanır…</p></div>
  if (error || !data) return <div className="loading-screen error-screen"><div className="loading-mark">AXIN</div><h2>Data yüklənmədi</h2><p>{error || 'Naməlum xəta'}</p><small>Frontend-i `frontend` qovluğundan Vite ilə işə saldığınıza əmin olun.</small></div>

  const { summary, connections, hubs, finance } = data
  const viewTitle = navItems.find((item) => item.id === activeView)?.label ?? 'Ümumi baxış'

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">A</div><div><strong>AXIN</strong><span>Mobility intelligence</span></div><button className="close-sidebar" onClick={() => setSidebarOpen(false)}>×</button></div>
      <div className="workspace-switch"><span className="workspace-dot" /><div><small>WORKSPACE</small><b>Bakı şəhəri</b></div><Icon name="chevron" size={15} /></div>
      <nav className="main-nav"><span className="nav-caption">İCMAL</span>{navItems.map((item) => <button key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => { setActiveView(item.id); setSidebarOpen(false) }}><Icon name={item.icon} size={18} /><span>{item.label}</span>{item.id === 'connections' && <em>{connections.filter((row) => row.selected).length}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="status-card"><span className="live-dot" /><div><b>Live data layer</b><small>17 oktyabr 2026</small></div></div><div className="user-card"><div className="avatar">AY</div><div><b>AYNA analitika</b><small>Admin workspace</small></div><Icon name="more" size={18} /></div></div>
    </aside>
    {sidebarOpen && <button className="sidebar-backdrop" aria-label="Menyunu bağla" onClick={() => setSidebarOpen(false)} />}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Icon name="grid" size={20} /></button><div className="breadcrumb"><span>AXIN /</span><b>{viewTitle}</b></div><div className="top-actions"><div className="top-search"><Icon name="search" size={16} /><span>Dashboardda axtar…</span><kbd>⌘ K</kbd></div><button className="icon-button" aria-label="Bildirişlər"><Icon name="bell" size={18} /><i /></button><div className="top-avatar">AY</div></div></header>
      <div className="content-wrap">
        {activeView === 'overview' && <Overview summary={summary} connections={connections} hubs={hubs} finance={finance} />}
        {activeView === 'map' && <MapView summary={summary} />}
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
  const selectedConnections = connections.filter((row) => row.selected)
  const selectedHubs = hubs.filter((row) => row.selected).sort((a, b) => a.rank - b.rank)
  const financeTop = finance.slice().sort((a, b) => b['cəmi_azn'] - a['cəmi_azn']).slice(0, 5).map((row) => ({ label: row['maddə'], value: row['cəmi_azn'] }))
  const coverageChange = ((future.coverage_pct - current.coverage_pct) / current.coverage_pct * 100).toFixed(1)
  return <>
    <SectionHeader eyebrow="AYNA · QƏRAR MƏRKƏZİ" title="Bakı mikromobillik şəbəkəsi" description="Mövcud vəziyyəti, investisiya prioritetlərini və 2026 inkişaf ssenarisini bir ekranda izləyin." action={<div className="header-actions"><button className="secondary-button"><Icon name="download" size={15} /> Hesabatı yüklə</button><button className="primary-button"><span className="live-dot" /> Ssenari aktivdir</button></div>} />
    <div className="hero-banner"><div className="hero-copy"><span className="eyebrow mint">2026 İNKİŞAF SSENARİSİ</span><h1>Şəbəkəni birləşdir,<br /><em>şəhəri hərəkətə gətir.</em></h1><p>AXIN analitikası mövcud 64,1 km şəbəkəni 75,5 km vahid şəbəkəyə çevirmək üçün ən yüksək təsirli bağlantıları seçib.</p><div className="hero-meta"><div><b>{money(summary.capex_azn)}</b><span>ümumi kapital xərci</span></div><div><b>{summary.months} ay</b><span>təxmini icra müddəti</span></div><div><b>+{summary.newly_connected}</b><span>yeni qoşulan məntəqə</span></div></div></div><div className="hero-visual"><div className="network-orbit orbit-one" /><div className="network-orbit orbit-two" /><div className="network-core"><Icon name="bike" size={34} /><span>75,5 km</span></div><span className="node n1" /><span className="node n2" /><span className="node n3" /><span className="node n4" /></div></div>
    <div className="metric-grid"><MetricCard label="Mövcud velo zolağı" value={`${fmt(current.lanes_km, 1)} km`} change={`+${fmt(future.lanes_km - current.lanes_km, 1)} km`} changeLabel="ssenari sonrası" tone="purple" icon="route" /><MetricCard label="Şəbəkə əhatəsi" value={`${fmt(current.coverage_pct, 1)}%`} change={`+${fmt(future.coverage_pct - current.coverage_pct, 1)}%`} changeLabel={`gələcək · ${coverageChange}% artım`} tone="mint" icon="map" /><MetricCard label="Əlaqəsiz məntəqə" value={fmt(current.disconnected)} change={`-${fmt(current.disconnected - future.disconnected)}`} changeLabel="ssenari sonrası" tone="orange" icon="pin" /><MetricCard label="İllik texniki xidmət" value={money(summary.maintenance_azn_year)} change="8 ay" changeLabel="icra müddəti" tone="blue" icon="wallet" /></div>
    <div className="dashboard-grid overview-grid"><Panel className="coverage-panel"><PanelHeader title="Şəbəkə əhatəsi" subtitle="Əvvəl → indi → inkişaf ssenarisi" action={<StatusBadge tone="mint">+{fmt(future.coverage_pct - current.coverage_pct, 1)} pp</StatusBadge>} /><AreaChart values={phaseKeys.map((key) => phases[key].coverage_pct)} labels={['2025', '2026', 'Ssenari']} /><div className="chart-footnote"><span><i className="legend-dot purple" />Zolaqdan 300 m-də yaşayan sakin</span><b>{fmt(future.coverage_pop)} nəfər</b></div></Panel><Panel><PanelHeader title="İnvestisiya bölgüsü" subtitle="Prioritet istiqamətlər üzrə" action={<button className="more-button"><Icon name="more" size={18} /></button>} /><DonutChart segments={financeTop.slice(0, 4)} centerValue={money(summary.capex_azn)} centerLabel="ümumi" /></Panel><Panel className="wide-panel"><PanelHeader title="Prioritet bağlantılar" subtitle={`${selectedConnections.length} istiqamət seçilib · fayda/xərc nisbətinə görə`} action={<button className="text-button">Hamısına bax <Icon name="chevron" size={14} /></button>} /><div className="priority-table"><div className="priority-head"><span>İSTİQAMƏT</span><span>UZUNLUQ</span><span>YENİ MƏNTƏQƏ</span><span>XƏRC</span><span>STATUS</span></div>{selectedConnections.slice(0, 5).map((row) => <div className="priority-row" key={row.id}><div><strong>{row.name}</strong><small>{row.from} → {row.to}</small></div><b>{fmt(row.length_km, 2)} km</b><b>{row.newly_connected}</b><b>{money(row.cost_azn)}</b><StatusBadge tone="mint">Seçildi</StatusBadge></div>)}</div></Panel><Panel className="wide-panel hub-panel"><PanelHeader title="Optimal hublar" subtitle="Şəbəkə və ictimai nəqliyyatın inteqrasiya nöqtələri" action={<button className="text-button">Detallara bax <Icon name="chevron" size={14} /></button>} /><div className="hub-list">{selectedHubs.slice(0, 4).map((hub) => <div className="hub-item" key={hub.name}><span className="hub-rank">0{hub.rank}</span><div className="hub-main"><strong>{hub.name}</strong><span><Icon name="route" size={13} /> {hub.n_lines} avtobus xətti <i /> <Icon name="pin" size={13} /> {hub.parkings} məntəqə</span></div><div className="hub-pop"><b>{fmt(hub.pop)}</b><span>500 m-də sakin</span></div><Icon name="chevron" size={16} className="muted-icon" /></div>)}</div></Panel></div>
  </>
}

function MapView({ summary }) {
  const future = summary.phases['GƏLƏCƏK']
  return <><SectionHeader eyebrow="GIS ANALİTİKA" title="Şəbəkə xəritəsi" description="Mövcud zolaqlar, seçilmiş yeni bağlantılar, əlaqəsiz məntəqələr və optimal hublar." action={<div className="header-actions"><button className="secondary-button"><Icon name="filter" size={15} /> Laylar</button><button className="primary-button"><Icon name="external" size={15} /> Tam xəritəni aç</button></div>} /><Panel className="map-panel"><div className="map-toolbar"><div className="map-legend"><span><i className="map-line existing" /> Mövcud zolaq</span><span><i className="map-line proposed" /> Yeni bağlantı</span><span><i className="map-dot disconnected" /> Əlaqəsiz məntəqə</span><span><i className="map-dot hub" /> Optimal hub</span></div><StatusBadge tone="purple">Vahid şəbəkə · {future.lanes_km} km</StatusBadge></div><div className="map-frame"><iframe title="AXIN xəritəsi" src="/processed/xerite_after.html" /></div><div className="map-footer"><span><b>{future.network_parts}</b> şəbəkə hissəsi</span><span><b>{future.hubs}</b> optimal hub</span><span><b>{future.disconnected}</b> əlaqəsiz məntəqə</span><span className="map-note">Xəritə: OSM + hakaton dataları</span></div></Panel></>
}

function ConnectionsView({ connections }) {
  const [query, setQuery] = useState('')
  const [onlySelected, setOnlySelected] = useState(true)
  const filtered = useMemo(() => connections.filter((row) => (!onlySelected || row.selected) && `${row.id} ${row.name} ${row.from} ${row.to}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.azn_per_benefit - b.azn_per_benefit), [connections, onlySelected, query])
  return <><SectionHeader eyebrow="INVESTİSİYA PRIORİTETLƏRİ" title="Prioritet bağlantılar" description="Hər istiqamətin təsiri, xərci və şəbəkə funksiyasını müqayisə edin." action={<button className="secondary-button"><Icon name="download" size={15} /> CSV yüklə</button>} /><div className="filter-row"><div className="input-search"><Icon name="search" size={16} /><input placeholder="İstiqamət və ya küçə axtar…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><button className={`filter-toggle ${onlySelected ? 'active' : ''}`} onClick={() => setOnlySelected((value) => !value)}><Icon name="check" size={15} /> Yalnız seçilənlər</button><span className="result-count">{filtered.length} nəticə</span></div><Panel className="table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>ID</th><th>İstiqamət</th><th>Uzunluq</th><th>Yeni məntəqə</th><th>Şəbəkə təsiri</th><th>Xərc</th><th>₼ / fayda</th><th>Status</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><span className="table-id">{row.id}</span></td><td><strong>{row.name}</strong><small>{row.from} → {row.to}</small></td><td>{fmt(row.length_km, 2)} km</td><td><b className="accent-number">+{row.newly_connected}</b></td><td>{row.merges_network ? <StatusBadge tone="purple">Şəbəkəni birləşdirir</StatusBadge> : row.links_transit_hub ? <StatusBadge tone="blue">Nəqliyyat qovşağı</StatusBadge> : <span className="muted-text">Lokal bağlantı</span>}</td><td>{money(row.cost_azn)}</td><td>{money(row.azn_per_benefit)}</td><td><StatusBadge tone={row.selected ? 'mint' : 'gray'}>{row.selected ? 'Seçildi' : 'Gözləmə'}</StatusBadge></td></tr>)}</tbody></table></div></Panel></>
}

function HubsView({ hubs }) {
  const selected = hubs.filter((hub) => hub.selected).sort((a, b) => a.rank - b.rank)
  const candidates = hubs.filter((hub) => !hub.selected).sort((a, b) => b.n_lines - a.n_lines).slice(0, 5)
  return <><SectionHeader eyebrow="İNTEQRASİYA NÖQTƏLƏRİ" title="Optimal hublar" description="Metro, avtovağzal və velosiped məntəqələrini vahid multimodal şəbəkədə birləşdirən seçilmiş nöqtələr." action={<button className="secondary-button"><Icon name="download" size={15} /> Namizəd siyahısı</button>} /><div className="hub-summary-grid"><MetricCard label="Seçilmiş hub" value={selected.length} change={`+${selected.reduce((sum, hub) => sum + hub.n_lines, 0)}`} changeLabel="avtobus xətti əhatəsi" tone="purple" icon="pin" /><MetricCard label="İnteqrasiya olunan məntəqə" value={selected.reduce((sum, hub) => sum + hub.parkings, 0)} change="mövcud" changeLabel="yeni satınalma tələb etmir" tone="mint" icon="bike" /><MetricCard label="500 m-də sakin" value={fmt(selected.reduce((sum, hub) => sum + hub.pop, 0))} change="əhatə" changeLabel="seçilmiş hubların cəmi" tone="orange" icon="map" /></div><div className="dashboard-grid hubs-grid"><Panel className="wide-panel"><PanelHeader title="Seçilmiş hublar" subtitle="Fayda və əlçatanlıq balına görə sıralanıb" /><div className="selected-hubs">{selected.map((hub) => <div className="selected-hub" key={hub.name}><div className="selected-hub-rank">{String(hub.rank).padStart(2, '0')}</div><div className="selected-hub-main"><span className="eyebrow">{hub.kind}</span><h3>{hub.name}</h3><p>{hub.reason}</p><div className="tag-row"><StatusBadge tone="blue">{hub.n_lines} avtobus xətti</StatusBadge><StatusBadge tone="gray">{hub.parkings} məntəqə</StatusBadge><StatusBadge tone="mint">{money(hub.cost_azn)}</StatusBadge></div></div><div className="hub-score"><b>{fmt(hub.pop)}</b><span>potensial sakin</span><div className="score-line"><i style={{ width: `${Math.min((hub.pop / 18000) * 100, 100)}%` }} /></div></div></div>)}</div></Panel><Panel><PanelHeader title="Güclü namizədlər" subtitle="Seçilməyən, amma yüksək xətt sıxlığı olan nöqtələr" /><Bars items={candidates.map((hub) => ({ label: hub.name.replace(' metro', ''), value: hub.n_lines }))} formatter={(value) => `${value} xətt`} color="#36b7d8" /></Panel></div></>
}

function FinanceView({ summary, finance }) {
  const [showAssumptions, setShowAssumptions] = useState(false)
  const max = Math.max(...finance.map((row) => row['cəmi_azn']))
  return <><SectionHeader eyebrow="MALİYYƏ VƏ İCRA" title="İnvestisiya planı" description="İnkişaf ssenarisinin kapital xərci, qənaəti və mərhələli icra çərçivəsi." action={<button className="secondary-button"><Icon name="download" size={15} /> Maliyyə hesabatı</button>} /><div className="finance-hero"><div><span className="eyebrow mint">ÜMUMİ KAPİTAL XƏRCİ</span><h1>{money(summary.capex_azn)}</h1><p>Seçilmiş {summary.selected_km} km bağlantı, {summary.phases['GƏLƏCƏK'].hubs} hub və rəqəmsal platforma.</p></div><div className="finance-hero-stats"><div><b>{money(summary.saving_lanes_azn + summary.saving_parking_azn)}</b><span>mövcud infrastrukturla qənaət</span></div><div><b>{money(summary.azn_per_new_connection)}</b><span>1 yeni məntəqə / bağlantı</span></div><div><b>{summary.months} ay</b><span>təxmini icra</span></div></div></div><div className="dashboard-grid finance-grid"><Panel className="wide-panel"><PanelHeader title="Xərc maddələri" subtitle="Bütün məbləğlər AZN ilə" action={<button className="more-button" onClick={() => setShowAssumptions((value) => !value)}><Icon name="more" size={18} /></button>} /><div className="finance-bars">{finance.map((row) => <div className="finance-bar" key={row['maddə']}><div className="finance-bar-top"><span>{row['maddə']}</span><b>{money(row['cəmi_azn'])}</b></div><div className="finance-track"><i style={{ width: `${(row['cəmi_azn'] / max) * 100}%` }} /></div><small>{fmt(row.miqdar, 2)} {row.vahid} × {money(row['vahid_qiymət_azn'])}</small></div>)}</div>{showAssumptions && <div className="assumption-note"><Icon name="check" size={16} /> Vahid qiymətlər `config/assumptions.json` faylından gəlir. Rəqəmlər ESTIMATE statusundadır və real smeta ilə yenilənməlidir.</div>}</Panel><Panel><PanelHeader title="İcra mərhələləri" subtitle="Təxmini timeline" /><div className="timeline"><div className="timeline-item"><span className="timeline-dot done" /><div><b>Hazırlıq və layihələndirmə</b><small>Ay 1–2 · 2 ay</small></div></div><div className="timeline-item"><span className="timeline-dot current" /><div><b>Prioritet bağlantıların icrası</b><small>Ay 3–6 · 4 ay</small></div></div><div className="timeline-item"><span className="timeline-dot future" /><div><b>Hub və platforma inteqrasiyası</b><small>Ay 7–8 · 2 ay</small></div></div></div><div className="savings-card"><span className="eyebrow">QƏNAƏT</span><b>{money(summary.saving_lanes_azn + summary.saving_parking_azn)}</b><p>Rənglənmiş zolaq və mövcud məntəqələrin təkrar istifadəsi.</p></div></Panel></div></>
}

export default App
