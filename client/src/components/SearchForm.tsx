import { useState, type FormEvent, type KeyboardEvent } from 'react'
import styles from './SearchForm.module.css'

interface SearchFormProps {
  onSearch: (question: string) => void
  loading: boolean
}

export function SearchForm({
  onSearch,
  loading,
}: SearchFormProps) {
  const [question, setQuestion] = useState('')

  const submit = (): void => {
    const trimmed = question.trim()
    if (!trimmed) return
    onSearch(trimmed)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className={styles.wrapper}>
        <textarea
          className={styles.input}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Stellen Sie Fragen zu BMF-Schreiben und Verwaltungsanweisungen des Bundesfinanzministeriums …"
          aria-label="Suchanfrage zum deutschen Steuerrecht"
          disabled={loading}
          rows={2}
        />
        <div className={styles.bottom}>
          <button
            className={styles.searchBtn}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Suche...' : 'Suchen →'}
          </button>
        </div>
      </div>
    </form>
  )
}
