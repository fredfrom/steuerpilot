import type { Source } from '../graphql/queries'
import styles from './SourceCard.module.css'

interface SourceCardProps {
  source: Source
}

export function SourceCard({ source }: SourceCardProps) {
  const scorePercent = Math.round(source.relevanceScore * 100)

  return (
    <article className={styles.card}>
      <div className={styles.titleRow}>
        <a
          className={styles.title}
          href={source.bmfUrl}
          target="_blank"
          rel="noreferrer"
        >
          {source.title}
        </a>
        <span className={styles.score}>{scorePercent}%</span>
      </div>
      <div className={styles.meta}>
        <span className={styles.badge}>{source.steuerart}</span>
        <span className={styles.separator}>|</span>
        <span>{source.date}</span>
        <span className={styles.separator}>|</span>
        <span>{source.gz}</span>
      </div>
    </article>
  )
}
