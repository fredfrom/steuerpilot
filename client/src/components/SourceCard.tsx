import type { Source } from '../graphql/queries'
import styles from './SourceCard.module.css'

interface SourceCardProps {
  source: Source
}

function relevanceClass(score: number): string {
  if (score >= 0.8) return styles.relevanceHigh
  if (score >= 0.6) return styles.relevanceMedium
  return styles.relevanceLow
}

export function SourceCard({ source }: SourceCardProps) {
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
        <span className={`${styles.relevance} ${relevanceClass(source.relevanceScore)}`}>
          Relevanz
        </span>
      </div>
      <div className={styles.meta}>
        <span className={styles.badge}>{source.steuerart}</span>
        <span className={styles.separator}>|</span>
        <span>{source.date}</span>
        <span className={styles.separator}>|</span>
        <span>{source.gz}</span>
      </div>
      {source.tldr && (
        <p className={styles.tldr}>{source.tldr}</p>
      )}
    </article>
  )
}
