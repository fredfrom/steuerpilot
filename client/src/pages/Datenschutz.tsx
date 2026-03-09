import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import styles from './LegalPage.module.css'

export default function Datenschutz() {
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

      <h1 className={styles.heading}>Datenschutzerklärung</h1>

      <section className={styles.section}>
        <h2 className={styles.subheading}>1. Verantwortlicher</h2>
        <p className={styles.text}>
          Verantwortlich für die Datenverarbeitung auf dieser Website ist:<br />
          Friedemann Frommelt, Plaußigerstraße 6, 04318 Leipzig<br />
          E-Mail: steuerpilot.ladder994@aleeas.com
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subheading}>2. Keine Erhebung personenbezogener Daten</h2>
        <p className={styles.text}>
          Steuerpilot erhebt, speichert oder verarbeitet keine personenbezogenen
          Daten seiner Nutzer. Im Einzelnen:
        </p>
        <ul className={styles.list}>
          <li>Es werden keine Cookies gesetzt.</li>
          <li>Es werden keine Analyse- oder Tracking-Dienste eingesetzt.</li>
          <li>Es werden keine externen Schriftarten, CDNs oder Ressourcen geladen
            — alle Assets werden vom eigenen Server ausgeliefert.</li>
          <li>Suchanfragen werden nicht gespeichert. Sie werden ausschließlich zur
            Erzeugung einer Antwort an die KI-Schnittstelle übermittelt und danach
            verworfen.</li>
          <li>KI-generierte Antworten werden nicht gespeichert.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subheading}>3. Server-Logdateien</h2>
        <p className={styles.text}>
          Der Hosting-Anbieter erhebt im Rahmen der technischen Bereitstellung
          der Website in Server-Logdateien automatisch Informationen, die Ihr
          Browser übermittelt. Dazu können gehören:
        </p>
        <ul className={styles.list}>
          <li>IP-Adresse</li>
          <li>Datum und Uhrzeit der Anfrage</li>
          <li>Angeforderte URL</li>
          <li>HTTP-Statuscode</li>
          <li>Browsertyp und -version</li>
        </ul>
        <p className={styles.text}>
          Diese Daten werden ausschließlich zur Sicherstellung des technischen
          Betriebs verwendet und nach kurzer Zeit automatisch gelöscht. Eine
          Zusammenführung mit anderen Datenquellen findet nicht statt.
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
          an der technischen Bereitstellung der Website).
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subheading}>4. Externe Dienste (serverseitig)</h2>
        <p className={styles.text}>
          Zur Beantwortung von Suchanfragen nutzt der Server folgende Dienste:
        </p>
        <ul className={styles.list}>
          <li>Mistral AI — zur Generierung von Antworten</li>
          <li>Groq — als Fallback-Sprachmodell</li>
          <li>HuggingFace Inference API — zur Erzeugung von Embeddings bei der
            Dokumentenindexierung</li>
        </ul>
        <p className={styles.text}>
          Diese Dienste werden ausschließlich serverseitig aufgerufen. Ihr
          Browser stellt keine direkte Verbindung zu diesen Diensten her.
          Es werden keine personenbezogenen Daten an diese Dienste übermittelt
          — lediglich die eingegebene Suchanfrage wird zur Antwortgenerierung
          weitergeleitet.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subheading}>5. Ihre Rechte</h2>
        <p className={styles.text}>
          Sie haben das Recht auf Auskunft, Berichtigung, Löschung und
          Einschränkung der Verarbeitung Ihrer personenbezogenen Daten sowie
          das Recht auf Datenübertragbarkeit. Da wir jedoch keine
          personenbezogenen Daten erheben oder speichern, sind diese Rechte
          im Regelfall gegenstandslos. Bei Fragen wenden Sie sich bitte an
          die oben genannte E-Mail-Adresse.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.subheading}>6. Beschwerderecht</h2>
        <p className={styles.text}>
          Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde
          über die Verarbeitung Ihrer personenbezogenen Daten zu beschweren.
        </p>
      </section>

      <footer className={styles.footer}>
        <Link to="/impressum">Impressum</Link>
      </footer>
    </div>
  )
}
