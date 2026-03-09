import Markdown from 'react-markdown'
import styles from './AnswerDisplay.module.css'

interface AnswerDisplayProps {
  answer: string
}

export function AnswerDisplay({ answer }: AnswerDisplayProps) {
  return (
    <section className={styles.container}>
      <h2 className={styles.heading}>Antwort</h2>
      <div className={styles.text}>
        <Markdown>{answer}</Markdown>
      </div>
    </section>
  )
}
