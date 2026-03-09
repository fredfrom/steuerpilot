import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type { CategoryCount } from '../graphql/queries'
import styles from './SearchForm.module.css'

interface SearchFormProps {
  onSearch: (question: string) => void
  loading: boolean
  categories: CategoryCount[]
  selectedSteuerart: string
  onSteuerartChange: (steuerart: string) => void
}

export function SearchForm({
  onSearch,
  loading,
  categories,
  selectedSteuerart,
  onSteuerartChange,
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
          placeholder="Stellen Sie Ihre Frage zum Steuerrecht..."
          disabled={loading}
          rows={2}
        />
        <div className={styles.bottom}>
          <div className={styles.pills}>
            {categories.slice(0, 5).map((cat) => (
              <button
                key={cat.steuerart}
                type="button"
                className={`${styles.pill} ${selectedSteuerart === cat.steuerart ? styles.pillActive : ''}`}
                onClick={() =>
                  onSteuerartChange(
                    selectedSteuerart === cat.steuerart ? '' : cat.steuerart
                  )
                }
              >
                {cat.steuerart}
              </button>
            ))}
          </div>
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
