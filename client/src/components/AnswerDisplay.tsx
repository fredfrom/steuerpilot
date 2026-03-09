import Markdown from 'react-markdown'
import styles from './AnswerDisplay.module.css'

interface AnswerDisplayProps {
  answer: string
}

export function AnswerDisplay({ answer }: AnswerDisplayProps) {
  return (
    <div>
      <div className={styles.card}>
        <div className={styles.eyebrow}>Antwort</div>
        <div className={styles.text}>
          <Markdown>{answer}</Markdown>
        </div>
      </div>
      <div className={styles.disclaimer}>
        <span className={styles.disclaimerIcon}>ℹ</span>
        <span className={styles.disclaimerText}>
          <strong>Kein Rechts- oder Steuerberatungsersatz.</strong> Diese
          Antwort dient nur der Orientierung. Prüfen Sie stets die verlinkten
          Quelldokumente. Keine Gewähr für Vollständigkeit oder Aktualität.
          Dieses Tool ist ein nicht-kommerzielles Demonstrationsprojekt.
        </span>
      </div>
    </div>
  )
}
