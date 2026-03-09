import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import styles from './LegalPage.module.css'

export default function Impressum() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,nofollow'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  return (
    <div className={styles.container}>
      <nav className={styles.nav}>
        <Link to="/" className={styles.backLink}>
          Zur Suche
        </Link>
      </nav>

      <h1 className={styles.heading}>Impressum</h1>

      <section className={styles.section}>
        <h2 className={styles.subheading}>Angaben gemäß § 5 TMG</h2>

        <p className={styles.text}>
          Friedemann Frommelt<br />
          Plaußigerstraße 6<br />
          04318 Leipzig<br />
          Deutschland
        </p>

        <p className={styles.text}>
          Dieses Projekt ist ein nicht-kommerzielles Demonstrationsprojekt.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subheading}>Kontakt</h2>
        <p className={styles.text}>
          E-Mail: steuerpilot.ladder994@aleeas.com
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subheading}>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
        <p className={styles.text}>
          Friedemann Frommelt<br />
          Plaußigerstraße 6<br />
          04318 Leipzig
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subheading}>Haftungsausschluss</h2>
        <p className={styles.text}>
          Die über Steuerpilot bereitgestellten Informationen stammen aus
          offiziellen BMF-Schreiben und werden durch KI-gestützte Zusammenfassungen
          ergänzt. Diese Informationen ersetzen keine professionelle steuerliche
          Beratung. Für die Richtigkeit und Vollständigkeit der KI-generierten
          Antworten wird keine Haftung übernommen.
        </p>
      </section>

      <footer className={styles.footer}>
        <Link to="/datenschutz">Datenschutzerklärung</Link>
      </footer>
    </div>
  )
}
