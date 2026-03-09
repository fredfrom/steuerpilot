import { useLazyQuery } from '@apollo/client/react'
import { SEARCH_QUERY, type SearchData } from './graphql/queries'
import { SearchForm } from './components/SearchForm'
import { AnswerDisplay } from './components/AnswerDisplay'
import { SourceList } from './components/SourceList'
import { StatsBar } from './components/StatsBar'
import { ErrorMessage } from './components/ErrorMessage'
import { LoadingSpinner } from './components/LoadingSpinner'
import styles from './App.module.css'

export default function App() {
  const [executeSearch, { data, loading, error }] =
    useLazyQuery<SearchData>(SEARCH_QUERY)

  const handleSearch = (question: string): void => {
    void executeSearch({ variables: { question } })
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Steuerpilot</h1>
        <p className={styles.subtitle}>Semantische Suche in BMF-Schreiben</p>
      </header>

      <div className={styles.statsSection}>
        <StatsBar />
      </div>

      <div className={styles.searchSection}>
        <SearchForm onSearch={handleSearch} loading={loading} />
      </div>

      <div className={styles.results}>
        {loading && <LoadingSpinner />}

        {error && <ErrorMessage message={error.message} />}

        {data?.search && (
          <>
            <AnswerDisplay answer={data.search.answer} />
            <SourceList sources={data.search.sources} />
          </>
        )}
      </div>
    </div>
  )
}
