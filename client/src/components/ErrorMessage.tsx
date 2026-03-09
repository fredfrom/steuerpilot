import styles from './ErrorMessage.module.css'

interface ErrorMessageProps {
  message: string
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className={styles.container}>
      <span className={styles.label}>Fehler: </span>
      {message}
    </div>
  )
}
