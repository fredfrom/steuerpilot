import type { Source } from '../graphql/queries'
import { SourceCard } from './SourceCard'
import styles from './SourceList.module.css'

interface SourceListProps {
  sources: Source[]
}

export function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) return null

  return (
    <section>
      <div className={styles.header}>Quellen</div>
      <div className={styles.list}>
        {sources.map((source, index) => (
          <SourceCard key={`${source.bmfUrl}-${index}`} source={source} />
        ))}
      </div>
    </section>
  )
}
