import type { Source } from '../graphql/queries'
import styles from './SourceCard.module.css'

interface SourceCardProps {
  source: Source
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function SourceCard({ source }: SourceCardProps) {
  return (
    <a
      className={styles.card}
      href={source.bmfUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className={styles.headerRow}>
        <div className={styles.title}>{source.title}</div>
        <span className={styles.linkIcon}>↗</span>
      </div>
      {source.tldr && <div className={styles.tldr}>{source.tldr}</div>}
      <div className={styles.meta}>
        {source.steuerart && (
          <>
            <span className={`${styles.badge} ${styles.badgeCat}`}>
              {source.steuerart}
            </span>
            <span className={styles.metaSep}>·</span>
          </>
        )}
        {source.gz && (
          <>
            <span className={`${styles.badge} ${styles.badgeId}`}>
              {source.gz}
            </span>
            <span className={styles.metaSep}>·</span>
          </>
        )}
        {source.date && (
          <span className={styles.metaDate}>{formatDate(source.date)}</span>
        )}
      </div>
    </a>
  )
}
