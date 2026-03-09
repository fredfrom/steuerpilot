import { Link } from 'react-router-dom'
import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.left}>© 2026 Steuerpilot</div>
      <div className={styles.links}>
        <a
          href="https://github.com/fredfrom/steuerpilot"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <span className={styles.sep}>·</span>
        <Link to="/impressum">Impressum</Link>
        <span className={styles.sep}>·</span>
        <Link to="/datenschutz">Datenschutz</Link>
      </div>
    </footer>
  )
}
