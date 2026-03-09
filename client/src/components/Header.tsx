import styles from './Header.module.css'

interface HeaderProps {
  lastUpdated?: string
}

function formatLastUpdated(isoDate?: string): string {
  if (!isoDate) return '—'
  const date = new Date(isoDate)
  if (isNaN(date.getTime())) return isoDate
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function Header({ lastUpdated }: HeaderProps) {
  return (
    <header className={styles.header}>
      <a className={styles.logo} href="/">
        Steuerpilot
      </a>
      <span className={styles.liveBadge}>
        Stand: {formatLastUpdated(lastUpdated)}
      </span>
    </header>
  )
}
