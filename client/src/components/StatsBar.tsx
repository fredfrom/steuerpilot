import { useQuery } from '@apollo/client/react'
import { STATS_QUERY, type StatsData } from '../graphql/queries'
import styles from './StatsBar.module.css'

interface StatsBarProps {
  selectedSteuerart: string
  onSteuerartChange: (steuerart: string) => void
}

export function StatsBar({ selectedSteuerart, onSteuerartChange }: StatsBarProps) {
  const { data } = useQuery<StatsData>(STATS_QUERY)

  if (!data) return null

  const { totalDocuments, byCategory } = data.stats

  return (
    <div className={styles.bar}>
      <span>
        <span className={styles.stat}>{totalDocuments}</span> BMF-Schreiben
      </span>
      <span className={styles.separator}>|</span>
      <select
        className={styles.select}
        value={selectedSteuerart}
        onChange={(event) => onSteuerartChange(event.target.value)}
      >
        <option value="">Alle Kategorien</option>
        {byCategory.map((category) => (
          <option key={category.steuerart} value={category.steuerart}>
            {category.steuerart} ({category.count})
          </option>
        ))}
      </select>
    </div>
  )
}
