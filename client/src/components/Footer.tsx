import { Link } from 'react-router-dom'
import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <Link to="/impressum">Impressum</Link>
      <span className={styles.separator}>|</span>
      <Link to="/datenschutz">Datenschutzerklärung</Link>
    </footer>
  )
}
