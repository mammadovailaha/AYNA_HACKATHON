import React, { createContext, useContext, useMemo } from 'react'

// Dashboard axtarışı: kart, diaqram və bölmə başlıqları üzrə, böyük/kiçik hərfə və
// Azərbaycan diakritikasına həssas olmayan (ə→e, ı/İ→i, ş→s ...) uyğunlaşdırma.
const SearchContext = createContext({ query: '', folded: '' })

const FOLD = { ə: 'e', ı: 'i', i̇: 'i', ö: 'o', ü: 'u', ç: 'c', ş: 's', ğ: 'g' }
// Hər simvol tam bir simvola çevrilir — highlight üçün indekslər orijinal mətnlə üst-üstə düşür
export const fold = (text) => Array.from(String(text ?? ''), (ch) => {
  const lower = ch.toLocaleLowerCase('az')[0]
  return FOLD[lower] ?? lower
}).join('')

export function SearchProvider({ query, children }) {
  const value = useMemo(() => ({ query, folded: fold(query.trim()) }), [query])
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
}

export const useSearch = () => useContext(SearchContext)

// null: axtarış aktiv deyil; true/false: başlıq uyğun gəlir/gəlmir
export function useSearchMatch(title) {
  const { folded } = useSearch()
  if (!folded || typeof title !== 'string') return null
  return fold(title).includes(folded)
}

export const searchClass = (match) => (match === null ? '' : match ? 'search-hit' : 'search-dim')

// Panel/MetricCard olmayan kartlar üçün: başlığa görə önə çıxarılır və ya arxa plana keçir
export function SearchCard({ as: Tag = 'article', title, className = '', children }) {
  const match = useSearchMatch(title)
  return <Tag className={`${className} ${searchClass(match)}`}>{children}</Tag>
}

export function Mark({ text }) {
  const { folded } = useSearch()
  if (!folded || typeof text !== 'string') return text ?? null
  const source = Array.from(text)
  const haystack = fold(text)
  const parts = []
  let from = 0
  let index = haystack.indexOf(folded)
  while (index !== -1) {
    if (index > from) parts.push(source.slice(from, index).join(''))
    parts.push(<mark key={index} className="search-mark">{source.slice(index, index + folded.length).join('')}</mark>)
    from = index + folded.length
    index = haystack.indexOf(folded, from)
  }
  if (!parts.length) return text
  if (from < source.length) parts.push(source.slice(from).join(''))
  return <>{parts}</>
}
