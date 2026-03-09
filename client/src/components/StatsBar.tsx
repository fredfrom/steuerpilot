import { useQuery } from '@apollo/client/react'
import { STATS_QUERY, type StatsData } from '../graphql/queries'
import styles from './StatsBar.module.css'

export function StatsBar() {
  const { data } = useQuery<StatsData>(STATS_QUERY)

  if (!data) return null

  const { totalDocuments, byCategory } = data.stats

  return (
    <div className={styles.bar}>
      <span>
        <span className={styles.stat}>{totalDocuments}</span> BMF-Schreiben
      </span>
      <span className={styles.separator}>|</span>
      {byCategory.map((category, index) => (
        <span key={category.steuerart} className={styles.category}>
          {index > 0 && <span className={styles.separator}>,</span>}
          {category.steuerart}{' '}
          <span className={styles.categoryCount}>({category.count})</span>
        </span>
      ))}
    </div>
  )
}
