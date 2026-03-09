import { useState, type FormEvent } from 'react'
import styles from './SearchForm.module.css'

interface SearchFormProps {
  onSearch: (question: string) => void
  loading: boolean
}

export function SearchForm({ onSearch, loading }: SearchFormProps) {
  const [question, setQuestion] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    onSearch(trimmed)
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <input
        className={styles.input}
        type="text"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Stellen Sie Ihre Frage zum Steuerrecht..."
        disabled={loading}
      />
      <button className={styles.button} type="submit" disabled={loading}>
        {loading ? 'Suche...' : 'Suchen'}
      </button>
    </form>
  )
}
