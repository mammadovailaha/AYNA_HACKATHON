import React, { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './components/Icon'
import { AreaChart, Bars, DonutChart } from './components/Charts'
import { MetricCard, Panel, PanelHeader, SectionHeader, StatusBadge, ViewModeToggle } from './components/Ui'
import { useDashboardData } from './hooks/useDashboardData'
import { useLiveDashboard } from './hooks/useLiveDashboard'
import NetworkMap from './components/NetworkMap'
import { ComparisonTable, InfrastructureCards, LaneRecalculation, RealtimeStatus, VerificationBadge } from './components/Infrastructure'
import { fold, Mark, SearchCard, SearchHighlight, SearchProvider } from './components/Search'

const BRAND = 'ROUTORA'

const navItems = [
  { id: 'overview', label: 'Vahid mərkəz', icon: 'grid' },
  { id: 'map', label: 'Hub xəritəsi', icon: 'map' },
  { id: 'before-after', label: 'Şəbəkə ssenarisi', icon: 'chart' },
  { id: 'connections', label: 'Last-mile bağlantılar', icon: 'route' },
  { id: 'hubs', label: 'Mobility hub-lar', icon: 'pin' }
]

const getViewFromHash = () => {
  if (typeof window === 'undefined') return 'overview'
  const value = window.location.hash.replace(/^#\/?/, '')
  return navItems.some((item) => item.id === value) ? value : 'overview'
}

// Banner kateqoriyaları → Hub xəritəsində qat dəsti və fokus (data API-dən gəlir)
const MAP_CATEGORIES = {
  bus: { label: 'Avtobus', icon: 'route', layers: { hubs: true, heatmap: true }, heatMetric: 'hubs', focus: 'hubs', note: 'Avtobus: hub-lar və avtobus xətti sayı ilə çəkilmiş hub sıxlığı' },
  hub: { label: 'Mobility hub', icon: 'pin', layers: { hubs: true, links: true, radius: true }, focus: 'central', note: 'Mobility hub: mərkəzi hub-lar, əlaqələr və 500 m əhatə radiusları' },
  bike: { label: 'Velosiped', icon: 'bike', layers: { existing: true, planned: true }, focus: 'lanes', note: 'Velosiped: mövcud və planlaşdırılan velo zolaqları' },
  lastmile: { label: 'Last-mile', icon: 'map', layers: { planned: true, stations: true }, focus: 'planned', note: 'Last-mile: planlaşdırılan bağlantılar və mikromobillik məntəqələri' }
}
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('az-AZ', { maximumFractionDigits: digits, minimumFractionDigits: digits })
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

const findSearchView = (query, data) => {
  const term = fold(query.trim())
  if (!term || !data) return null
  const { connections = [], hubs = [] } = data
  const views = [
    { id: 'overview', terms: ['Vahid mərkəz', 'Vahid multimodal idarəetmə mərkəzi', 'Velo şəbəkəsi', 'Multimodal əhatə', 'Last-mile boşluğu', 'Vahid şəbəkə əhatəsi', 'Mövcud və planlaşdırılan şəbəkə', 'Əlaqəsiz məntəqə', 'İnfrastruktur artımı'] },
    { id: 'map', terms: ['Hub xəritəsi', 'HUB şəbəkəsi', 'Mikromobillik məntəqələri', 'Mərkəzi hub-lar', 'Mövcud hub-lar', 'Hub namizədləri', ...hubs.flatMap((hub) => [hub.name, hub.id])] },
    { id: 'before-after', terms: ['Şəbəkə ssenarisi', 'Şəbəkənin vahid sistemə çevrilməsi', 'Mövcud vəziyyət', 'Planlaşdırılan'] },
    { id: 'connections', terms: ['Last-mile bağlantılar', 'Prioritet last-mile bağlantılar', 'İstiqamət', 'İnteqrasiya rolu', ...connections.flatMap((row) => [row.id, row.name, row.from, row.to])] },
    { id: 'hubs', terms: ['Mobility hub-lar', 'Prioritet mobility hub-lar', 'Mərkəzi hub-lar', ...hubs.flatMap((hub) => [hub.name, hub.id])] }
  ]
  return views.find((view) => view.terms.some((value) => fold(value).includes(term)))?.id ?? null
}

function App() {
  const { data, loading, error } = useDashboardData()
  const [activeView, setActiveView] = useState(getViewFromHash)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState(null)
  const [mapCategory, setMapCategory] = useState(null)
  const searchInput = useRef(null)
  const searchTarget = useMemo(() => findSearchView(query, data), [query, data])

  useEffect(() => {
    const syncViewFromUrl = () => setActiveView(getViewFromHash())
    window.addEventListener('hashchange', syncViewFromUrl)
    window.addEventListener('popstate', syncViewFromUrl)
    return () => {
      window.removeEventListener('hashchange', syncViewFromUrl)
      window.removeEventListener('popstate', syncViewFromUrl)
    }
  }, [])

  // Axtarış qısayolu: Win/⌘ + K (Windows Win+K-nı sistem üçün tutur), Ctrl + K və "/" alternativdir
  useEffect(() => {
    const onKey = (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable
      if (((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing)) {
        event.preventDefault()
        searchInput.current?.focus()
        searchInput.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Uyğun gələn kartların sayı render-dən sonra ölçülür ("Nəticə tapılmadı" mesajı üçün)
  useEffect(() => {
    if (!query.trim()) { setHits(null); return undefined }
    const frame = requestAnimationFrame(() => setHits(document.querySelectorAll('.content-wrap .search-hit').length))
    return () => cancelAnimationFrame(frame)
  }, [query, activeView, data])

  if (loading) return <div className="loading-screen"><img className="loading-logo" src="/assets/routora.png" alt={BRAND} /><div className="loader" /><p>Dashboard məlumatları hazırlanır…</p></div>
  if (error || !data) return <div className="loading-screen error-screen"><img className="loading-logo" src="/assets/routora.png" alt={BRAND} /><h2>Data yüklənmədi</h2><p>{error || 'Naməlum xəta'}</p><small>API serverinin işlədiyinə əmin olun (npm run dev və ya npm start).</small></div>

  const { summary, connections, hubs } = data
  const viewTitle = navItems.find((item) => item.id === activeView)?.label ?? 'Ümumi baxış'

  const navigateToView = (viewId) => {
    setActiveView(viewId)
    if (window.location.hash !== `#${viewId}`) {
      window.history.pushState({ view: viewId }, '', `#${viewId}`)
    }
  }

  const handleNavClick = (viewId) => {
    navigateToView(viewId)
    setSidebarOpen(false)
    if (viewId === 'map') setMapCategory(null)
  }
  const openCategory = (key) => {
    setMapCategory({ key, nonce: Date.now() })
    navigateToView('map')
    window.scrollTo({ top: 0 })
  }
  const jumpToFirstHit = () => {
    const firstHit = document.querySelector('.content-wrap .search-hit')
    if (firstHit) {
      firstHit.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!searchTarget) return
    navigateToView(searchTarget)
    setSidebarOpen(false)
    requestAnimationFrame(() => document.querySelector('.content-wrap .search-hit')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><img className="brand-logo brand-logo-full" src="/assets/routora-with-text.png" alt={BRAND} /><img className="brand-logo brand-logo-compact" src="/assets/routora.png" alt={BRAND} /><button className="sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Sidebarı aç' : 'Sidebarı bağla'} title={sidebarCollapsed ? 'Sidebarı aç' : 'Sidebarı bağla'}><Icon name="chevron" size={17} /></button><button className="close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Menyunu bağla">×</button></div>
      <nav className="main-nav"><span className="nav-caption">İDARƏETMƏ</span>{navItems.map((item) => <button key={item.id} className={activeView === item.id ? 'active' : ''} data-tooltip={item.label} aria-label={item.label} onClick={() => handleNavClick(item.id)}><Icon name={item.icon} size={18} /><span>{item.label}</span>{item.id === 'connections' && <em>{connections.filter((row) => row.selected).length}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="status-card" data-tooltip="Real-time data qatı"><RealtimeStatus compact /></div></div>
    </aside>
    {sidebarOpen && <button className="sidebar-backdrop" aria-label="Menyunu bağla" onClick={() => setSidebarOpen(false)} />}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Icon name="grid" size={20} /></button><div className="breadcrumb"><span>{BRAND} /</span><b>{viewTitle}</b></div><div className="top-actions">
        <div className={`top-search ${query ? 'has-query' : ''}`} role="search">
          <Icon name="search" size={16} />
          <input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setQuery(''); event.currentTarget.blur() } if (event.key === 'Enter') jumpToFirstHit() }} placeholder="Dashboardda axtar…" aria-label="Dashboard kart və diaqram başlıqlarında axtar" title={`Qısayol: ${isMac ? '⌘' : 'Win'} + K · Ctrl + K · /`} />
          {query ? <button type="button" className="search-clear" onClick={() => { setQuery(''); searchInput.current?.focus() }} aria-label="Axtarışı təmizlə"><Icon name="close" size={13} /></button> : <kbd>{isMac ? '⌘ K' : 'Ctrl K'}</kbd>}
          {hits !== null && <div className={`search-status ${hits || searchTarget ? '' : 'empty'}`} role="status">{hits ? `${hits} uyğun kart/diaqram · Enter — keç` : searchTarget ? 'Nəticə başqa səhifədədir · Enter — aç' : 'Nəticə tapılmadı'}</div>}
        </div>
        <img className="top-avatar profile-avatar" src="/assets/user_photo.jpeg" alt="AYNA qərar mərkəzi" /></div></header>
      <SearchProvider query={query}><div className="content-wrap">
        {activeView === 'overview' && <Overview summary={summary} connections={connections} hubs={hubs} onCategory={openCategory} />}
        {activeView === 'map' && <MapView category={mapCategory} onClearCategory={() => setMapCategory(null)} />}
        {activeView === 'before-after' && <BeforeAfterView summary={summary} />}
        {activeView === 'connections' && <ConnectionsView connections={connections} />}
        {activeView === 'hubs' && <HubsView hubs={hubs} />}
      </div></SearchProvider>
    </main>
  </div>
}

function Overview({ summary, connections, hubs, onCategory }) {
  const [lastMileView, setLastMileView] = useState('table')
  const [hubView, setHubView] = useState('table')
  const live = useLiveDashboard().data
  const infra = live.summary.infrastructure
  const phases = summary.phases
  const current = phases['İNDİ']
  const future = phases['GƏLƏCƏK']
  const scenarioYear = current.label.match(/\b\d{4}\b/)?.[0] ?? 'İNDİ'
  const selectedConnections = connections.filter((row) => row.selected)
  const selectedHubs = hubs.filter((row) => row.selected).sort((a, b) => a.rank - b.rank)
  const featuredConnections = selectedConnections.slice(0, 5)
  const featuredHubs = selectedHubs.slice(0, 4)
  const hubPopulationTotal = featuredHubs.reduce((sum, hub) => sum + hub.pop, 0)
  const coverageChange = ((future.coverage_pct - current.coverage_pct) / current.coverage_pct * 100).toFixed(1)
  const reportRows = [
    { göstərici: 'Mövcud velosiped infrastrukturu', dəyər: `${fmt(infra.existing_km, 1)} km`, qeyd: 'Tikilib' },
    { göstərici: 'Yeni əlavə ediləcək hissə', dəyər: `+${fmt(infra.planned_addition_km, 1)} km`, qeyd: 'Planlaşdırılır' },
    { göstərici: 'Planlaşdırılan ümumi uzunluq', dəyər: `${fmt(infra.projected_total_km, 1)} km`, qeyd: 'Proqnoz' },
    { göstərici: 'İnfrastruktur artımı', dəyər: `${fmt(infra.growth_pct, 2)}%`, qeyd: 'Hesablanmış' },
    { göstərici: 'Təxmini icra müddəti', dəyər: `${summary.months} ay`, qeyd: 'İnkişaf ssenarisi' },
    { göstərici: 'Yeni qoşulan məntəqə', dəyər: `+${summary.newly_connected}`, qeyd: 'Məntəqə' }
  ]
  return <>
    <SectionHeader title="Vahid multimodal idarəetmə mərkəzi" description={`Avtobus, metro, velosiped zolaqları və mobility hub-ları ${scenarioYear} ssenarisi ilə bir sistemdə izləyin.`} action={<div className="header-actions"><button className="secondary-button" type="button" onClick={() => downloadCsv('routora-umumi-hesabat.csv', reportRows)}><Icon name="download" size={15} /> Hesabatı yüklə</button></div>} />
    <div className="hero-banner">
      <div className="hero-copy">
        <h1>Son mili tamamla,<br /><em>şəbəkəni vahid sistemə çevir.</em></h1>
        <p>{BRAND} avtobus və metro qovşaqlarını, velo zolaqlarını və mikromobillik məntəqələrini birləşdirərək mövcud {fmt(infra.existing_km, 1)} km şəbəkəni +{fmt(infra.planned_addition_km, 1)} km planlaşdırılan bağlantı ilə {fmt(infra.projected_total_km, 1)} km vahid last-mile sisteminə çevirir.</p>
        <nav className="system-flow" aria-label="Kateqoriyanı xəritədə aç">{Object.entries(MAP_CATEGORIES).map(([key, cat], index) => <React.Fragment key={key}>{index > 0 && <i aria-hidden="true">→</i>}<button type="button" className={`mode-chip chip-${key}`} onClick={() => onCategory(key)} title={`${cat.note} — xəritədə aç`}><Icon name={cat.icon} size={17} /> {cat.label}</button></React.Fragment>)}</nav>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="network-map" />
        <div className="network-orbit orbit-one" />
        <div className="network-orbit orbit-two" />
        <div className="network-core"><Icon name="bike" size={34} /><strong>{fmt(infra.projected_total_km, 1)} km</strong><span>Planlaşdırılan ümumi</span></div>
        <span className="node n1" /><span className="node n2" /><span className="node n3" /><span className="node n4" />
      </div>
    </div>
    <div className="metric-grid"><MetricCard label="Velo şəbəkəsi" value={`${fmt(infra.existing_km, 1)} km`} change={`+${fmt(infra.planned_addition_km, 1)} km`} changeLabel={`planlaşdırılır · +${fmt(infra.growth_pct, 2)}%`} tone="purple" icon="route" /><MetricCard label="Multimodal əhatə" value={`${fmt(current.coverage_pct, 1)}%`} change={`+${fmt(future.coverage_pct - current.coverage_pct, 1)}%`} changeLabel={`ssenari · ${coverageChange}% artım`} tone="mint" icon="map" /><MetricCard label="Last-mile boşluğu" value={fmt(current.disconnected)} change={`-${fmt(current.disconnected - future.disconnected)}`} changeLabel="hub ssenarisi sonrası" tone="orange" icon="pin" /></div>
    <SectionHeader title="Mövcud və planlaşdırılan şəbəkə" description="Mövcud yollar tikilib; əlavə hissə planlaşdırılır və hələ tikilməyib. Ümumi uzunluq və artım faizi API-də avtomatik hesablanır." />
    <div className="infra-layout">
      <InfrastructureCards infra={infra} />
      <Panel className="growth-panel"><PanelHeader title="Velo zolaqlarının paylanması" subtitle="MÖVCUD → ƏLAVƏ (TƏKLİF OLUNAN)" action={<StatusBadge tone="mint">+{fmt(infra.growth_pct, 2)}%</StatusBadge>} /><DonutChart className="network-share-chart" segments={[{ label: 'Mövcud velosiped zolaqları', value: infra.existing_km, color: '#7b8fb3' }, { label: 'Əlavə (təklif olunan) zolaqlar', value: infra.planned_addition_km, color: 'var(--blue)' }]} centerValue={`${fmt(infra.projected_total_km, 1)} km`} centerLabel="təklif olunan şəbəkə" valueSuffix=" km" showPercent /></Panel>
      <Panel className="realtime-panel"><PanelHeader title="Real-time data statusu" subtitle="Server-Sent Events" /><RealtimeStatus /></Panel>
      <Panel className="comparison-panel"><PanelHeader title="Mövcud vs planlaşdırılan" subtitle="Plan tətbiq olunduqdan sonrakı proqnoz" /><ComparisonTable comparison={live.comparison} /></Panel>
    </div>
    <div className="dashboard-grid overview-grid">
      <Panel className="coverage-panel wide-panel"><PanelHeader title="Vahid şəbəkə əhatəsi" subtitle="Avtobus · metro · velo · hub" action={<StatusBadge tone="mint">+{fmt(future.coverage_pct - current.coverage_pct, 1)} pp</StatusBadge>} /><AreaChart values={phaseKeys.map((key) => phases[key].coverage_pct)} labels={['2025', '2026', 'Ssenari']} /><div className="chart-footnote"><span><i className="legend-dot purple" />Zolaq və hub-a 300 m-də yaşayan sakin</span><b>{fmt(future.coverage_pop)} nəfər</b></div></Panel>
      <Panel className="wide-panel">
        <PanelHeader title="Last-mile prioritetləri" subtitle={`${selectedConnections.length} bağlantı seçilib · təsir və əlaqələndirmə potensialına görə`} action={<ViewModeToggle value={lastMileView} onChange={setLastMileView} />} />
        {lastMileView === 'table' ? <div className="priority-table"><div className="priority-head"><span>İSTİQAMƏT</span><span>UZUNLUQ</span><span>YENİ MƏNTƏQƏ</span><span>STATUS</span></div>{featuredConnections.map((row) => <div className="priority-row" key={row.id}><div><strong>{row.name}</strong><small>{row.from} → {row.to}</small></div><b>{fmt(row.length_km, 2)} km</b><b>{row.newly_connected}</b><StatusBadge tone="mint">Seçildi</StatusBadge></div>)}</div> : <div className="chart-view priority-chart"><div className="chart-context"><span><i className="legend-dot purple" />Təsir balı üzrə prioritet bağlantılar</span><b>{featuredConnections.reduce((sum, row) => sum + row.newly_connected, 0)} yeni məntəqə</b></div><Bars items={featuredConnections.map((row) => ({ label: `${row.id} · ${row.name}`, value: row.benefit }))} formatter={(value) => `${value} bal`} color="#7569ee" /></div>}
      </Panel>
      <Panel className="wide-panel hub-panel">
        <PanelHeader title="Prioritet mobility hub-lar" subtitle="Avtobus, metro və mikromobillik inteqrasiya nöqtələri" action={<ViewModeToggle value={hubView} onChange={setHubView} />} />
        {hubView === 'table' ? <div className="hub-list">{featuredHubs.map((hub) => <div className="hub-item" key={hub.name}><span className="hub-rank">0{hub.rank}</span><div className="hub-main"><strong>{hub.name}</strong><span><Icon name="route" size={13} /> {hub.n_lines} avtobus xətti <i /> <Icon name="pin" size={13} /> {hub.parkings} məntəqə</span></div><div className="hub-pop"><b>{fmt(hub.pop)}</b><span>500 m-də sakin</span></div><Icon name="chevron" size={16} className="muted-icon" /></div>)}</div> : <div className="chart-view hub-distribution-chart"><div className="chart-context"><span><i className="legend-dot mint" />500 m-də sakinlərin hub-lar üzrə payı</span><b>{fmt(hubPopulationTotal)} sakin</b></div><DonutChart segments={featuredHubs.map((hub) => ({ label: hub.name, value: hub.pop }))} centerValue={fmt(hubPopulationTotal)} centerLabel="ümumi sakin" valueSuffix=" nəfər" /></div>}
      </Panel>
    </div>
  </>
}

function MapView({ category, onClearCategory }) {
  const preset = category ? { ...MAP_CATEGORIES[category.key], key: category.key, nonce: category.nonce } : null
  const live = useLiveDashboard().data
  const { cycling, hubs, hubNetwork } = live
  const unlocated = hubs.hubs.filter((hub) => !hub.coordinates)
  // HUB xəritəsi: əvvəlki qatlar default açıq qalır; yeni radius qatı istifadəçi seçimi ilə açılır
  const toggles = [
    { key: 'existing', label: 'Mövcud velo yolları', value: `${fmt(cycling.existing.geometry_length_km, 1)} km xəritədə` },
    { key: 'planned', label: 'Planlaşdırılan yollar', value: `+${fmt(cycling.planned.length_km, 1)} km` },
    { key: 'hubs', label: 'HUB şəbəkəsi' },
    { key: 'links', label: 'HUB-lar arası əlaqələr', value: `${hubNetwork.links.features.length} əlaqə` },
    { key: 'radius', label: 'HUB radiusları', value: `${hubNetwork.config.coverage_radius_m} m` },
    { key: 'heatmap', label: 'Sıxlıq heatmap' },
    { key: 'stations', label: 'Mikromobillik məntəqələri', value: `${hubNetwork.counts.stations_total}` }
  ]
  return <>
    <SectionHeader title="HUB xəritəsi" description="Peyk görünüşündə mərkəzi hub-lar, ulduz şəbəkəsi əlaqələri, əhatə radiusları və sıxlıq. Hub-a klik edin — ona aid məntəqələr, zolaqlar və əlaqələr vurğulanacaq." action={<div className="header-actions"><button className="secondary-button" type="button" onClick={openMap}><Icon name="external" size={15} /> Əvvəlki xəritə</button></div>} />
    <NetworkMap key={category ? 'preset' : 'default'} title="HUB xəritəsi" toggles={toggles} heatMetricSwitch preset={preset} onClearPreset={onClearCategory} defaults={{ existing: true, planned: true, hubs: true, links: true, radius: false, heatmap: false, stations: false }} />
    <div className="dashboard-grid gis-notes">
      {unlocated.length > 0
        ? <Panel><PanelHeader title="Koordinatı yoxlanılmalı hub-lar" subtitle={`${unlocated.length} hub-un datasetdə koordinatı yoxdur — xəritədə və heatmap-da göstərilmir`} action={<StatusBadge tone="orange">Yoxlanılmalıdır</StatusBadge>} /><div className="unlocated-list">{unlocated.map((hub) => <span key={hub.id}><b>{hub.id}</b> {hub.name}</span>)}</div></Panel>
        : <Panel><PanelHeader title="HUB şəbəkəsinin qurulma qaydası" subtitle={`Bütün ${hubs.counts.total} hub-un koordinatı datasetdən gəlir`} action={<StatusBadge tone="mint">Real koordinatlar</StatusBadge>} /><ul className="dq-list">
          <li><b>Mərkəzi hub-lar:</b> {hubNetwork.counts.central} təklif edilən hub; {hubNetwork.config.backbone_rule.toLowerCase()} ({hubNetwork.counts.backbone_links} magistral əlaqə).</li>
          <li><b>Əlaqələr:</b> {hubNetwork.config.link_rule}. Bağlı: {hubNetwork.counts.satellites_linked}, kənarda qalan: {hubNetwork.counts.satellites_unlinked}.</li>
          <li><b>Radius:</b> {hubNetwork.config.coverage_radius_m} m — {hubNetwork.config.coverage_radius_source}. Kəsişən radiuslar: {hubNetwork.counts.overlaps} ortaq zona.</li>
          <li><b>Hub-a aid elementlər:</b> {hubNetwork.config.member_rule}.</li>
          <li><b>Heatmap:</b> hub nöqtələrinin sıxlığıdır (avtobus xətti sayı ilə çəkilib) — real sərnişin axını deyil.</li>
          <li>Koordinat mənbəyi: <b>hubs.geojson</b> (xəritə, OSM metro və dayanacaq koordinatları ilə ≤6 m yoxlanılıb).</li>
        </ul></Panel>}
      <Panel className="wide-panel"><PanelHeader title="Velo şəbəkəsinin yenidən hesablanması" subtitle="Bəyan edilmiş göstərici xam GIS geometriyası ilə yoxlanılır" action={<VerificationBadge check={cycling.existing.verification.existing} label="Mövcud" />} /><LaneRecalculation existing={cycling.existing} /></Panel>
    </div>
  </>
}

function BeforeAfterView({ summary }) {
  const live = useLiveDashboard().data
  const infra = live.comparison.infrastructure
  const { hubNetwork, cycling } = live
  const before = summary.phases['ƏVVƏL']
  const after = summary.phases['GƏLƏCƏK']
  const comparison = [
    { label: 'Velo infrastrukturu (mövcud → plan)', before: `${fmt(infra.before_km, 1)} km`, after: `${fmt(infra.projected_total_km, 1)} km` },
    { label: 'Şəbəkə əhatəsi', before: `${fmt(before.coverage_pct, 1)}%`, after: `${fmt(after.coverage_pct, 1)}%` },
    { label: 'Əlaqəsiz məntəqə', before: fmt(before.disconnected), after: fmt(after.disconnected) },
    { label: 'Şəbəkə hissələri', before: before.network_parts, after: after.network_parts }
  ]
  // Default: yalnız mövcud vəziyyət. Yeni ssenarinin hər elementi istifadəçi seçimi ilə açılır.
  const toggles = [
    { key: 'existing', label: 'Mövcud velo zolaqları', value: `${fmt(cycling.existing.geometry_length_km, 1)} km`, group: 'base' },
    { key: 'stations', label: 'Mikromobillik məntəqələri', value: `${hubNetwork.counts.stations_total}`, group: 'base' },
    { key: 'hubs', label: 'HUB şəbəkəsini göstər', group: 'scenario' },
    { key: 'radius', label: 'HUB radiuslarını göstər', group: 'scenario' },
    { key: 'links', label: 'HUB-lar arasındakı əlaqələri göstər', group: 'scenario' },
    { key: 'heatmap', label: 'Sıxlıq Heatmap-ini göstər', group: 'scenario' },
    { key: 'planned', label: 'Yeni təklif olunan infrastrukturu göstər', value: `+${fmt(cycling.planned.length_km, 1)} km`, group: 'scenario' }
  ]
  const footer = <>
    <span><b>{fmt(before.disconnected)}</b> → <b>{fmt(after.disconnected)}</b> əlaqəsiz məntəqə</span>
    <span><b>{fmt(before.coverage_pct, 1)}%</b> → <b>{fmt(after.coverage_pct, 1)}%</b> əhatə</span>
    <span><b>{before.network_parts}</b> → <b>{after.network_parts}</b> şəbəkə hissəsi</span>
    <span className="map-note">Default: mövcud vəziyyət · yeni ssenari qatları checkbox ilə aktivləşir</span>
  </>
  return <>
    <SectionHeader title="Şəbəkənin vahid sistemə çevrilməsi" description="Mövcud vəziyyət və yeni ssenari eyni xəritədə: əvvəlcə mövcud şəbəkəni görün, sonra hub, radius, əlaqə, heatmap və yeni infrastruktur qatlarını bir-bir aktivləşdirin." action={<StatusBadge tone="mint">+{fmt(infra.addition_km, 1)} km planlaşdırılır · +{fmt(infra.growth_pct, 2)}%</StatusBadge>} />
    <div className="comparison-grid">{comparison.map((item) => <SearchCard as="div" className="comparison-stat" title={item.label} key={item.label}><span><Mark text={item.label} /></span><div><b>{item.before}</b><Icon name="chevron" size={14} /><strong>{item.after}</strong></div></SearchCard>)}</div>
    <NetworkMap title="Şəbəkə ssenarisi xəritəsi" toggles={toggles} footer={footer} scenarioKey="planned" defaults={{ existing: true, stations: true, hubs: false, radius: false, links: false, heatmap: false, planned: false }} />
  </>
}

function ConnectionsView({ connections }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const term = fold(query.trim())
    return connections
      .filter((row) => !term || fold(`${row.id} ${row.name} ${row.from} ${row.to}`).includes(term))
      .sort((a, b) => b.benefit - a.benefit)
  }, [connections, query])
  return <><SectionHeader title="Prioritet last-mile bağlantılar" description="Avtovağzal, metro, avtobus şəbəkəsi və velosiped zolaqları arasındakı son-mil boşluqlarını təsir və əlaqələndirmə potensialına görə prioritetləşdirin." action={<button className="secondary-button" type="button" onClick={() => downloadCsv('routora-prioritet-baglantilar.csv', filtered)}><Icon name="download" size={15} /> CSV yüklə</button>} /><div className="filter-row"><div className="input-search"><Icon name="search" size={16} /><input placeholder="Hub, istiqamət və ya küçə axtar…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><span className="result-count">{filtered.length} nəticə</span></div><Panel className="table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>ID</th><th>İstiqamət</th><th>Uzunluq</th><th>Yeni məntəqə</th><th>İnteqrasiya rolu</th><th>Status</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><span className="table-id"><SearchHighlight text={row.id} query={query} /></span></td><td><strong><SearchHighlight text={row.name} query={query} /></strong><small><SearchHighlight text={`${row.from} → ${row.to}`} query={query} /></small></td><td>{fmt(row.length_km, 2)} km</td><td><b className="accent-number">+{row.newly_connected}</b></td><td>{row.merges_network ? <StatusBadge tone="purple">Şəbəkəni birləşdirir</StatusBadge> : row.links_transit_hub ? <StatusBadge tone="blue">Hub-a bağlanır</StatusBadge> : <span className="muted-text">Last-mile əlaqə</span>}</td><td><StatusBadge tone={row.selected ? 'mint' : 'gray'}>{row.selected ? 'Prioritet' : 'Gözləmə'}</StatusBadge></td></tr>)}</tbody></table></div></Panel></>
}

function HubsView({ hubs }) {
  const selected = hubs.filter((hub) => hub.selected).sort((a, b) => a.rank - b.rank)
  const candidateRows = hubs.filter((hub) => !hub.selected).sort((a, b) => b.n_lines - a.n_lines)
  const candidates = candidateRows.slice(0, 5)
  return <><SectionHeader title="Mobility hub-lar" description="Avtovağzal, metro, avtobus xətləri və mikromobillik məntəqələrini eyni qovşaqda inteqrasiya edin." action={<button className="secondary-button" type="button" onClick={() => downloadCsv('routora-hub-namizedleri.csv', candidateRows)}><Icon name="download" size={15} /> Namizəd siyahısı</button>} /><div className="hub-summary-grid"><MetricCard label="Prioritet mobility hub" value={selected.length} change={`+${selected.reduce((sum, hub) => sum + hub.n_lines, 0)}`} changeLabel="avtobus xətti əhatəsi" tone="purple" icon="pin" /><MetricCard label="İnteqrasiya olunan məntəqə" value={selected.reduce((sum, hub) => sum + hub.parkings, 0)} change="mövcud" changeLabel="yeni satınalma tələb etmir" tone="mint" icon="bike" /><MetricCard label="500 m-də sakin" value={fmt(selected.reduce((sum, hub) => sum + hub.pop, 0))} change="əhatə" changeLabel="seçilmiş hub-ların cəmi" tone="orange" icon="map" /></div><div className="dashboard-grid hubs-grid"><Panel className="wide-panel"><PanelHeader title="Prioritet mobility hub-lar" subtitle="Fayda və multimodal əlçatanlıq balına görə sıralanıb" /><div className="selected-hubs">{selected.map((hub) => <div className="selected-hub" key={hub.name}><div className="selected-hub-rank">{String(hub.rank).padStart(2, '0')}</div><div className="selected-hub-main"><h3>{hub.name}</h3><p>{hub.reason}</p><div className="tag-row"><StatusBadge tone="blue">{hub.n_lines} avtobus xətti</StatusBadge><StatusBadge tone="gray">{hub.parkings} məntəqə</StatusBadge></div></div><div className="hub-score"><b>{fmt(hub.pop)}</b><span>potensial sakin</span><div className="score-line"><i style={{ width: `${Math.min((hub.pop / 18000) * 100, 100)}%` }} /></div></div></div>)}</div></Panel><Panel><PanelHeader title="Növbəti hub namizədləri" subtitle="Yüksək xətt sıxlığı və last-mile potensialı" /><Bars items={candidates.map((hub) => ({ label: hub.name.replace(' metro', ''), value: hub.n_lines }))} formatter={(value) => `${value} xətt`} color="#36b7d8" /></Panel></div></>
}

export default App
