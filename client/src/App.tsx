import { useState, useEffect } from 'react'
import { useLazyQuery } from '@apollo/client/react'
import { SEARCH_QUERY, type SearchData } from './graphql/queries'
import { SearchForm } from './components/SearchForm'
import { AnswerDisplay } from './components/AnswerDisplay'
import { SourceList } from './components/SourceList'
import { StatsBar } from './components/StatsBar'
import { ErrorMessage } from './components/ErrorMessage'
import { LoadingSpinner } from './components/LoadingSpinner'
import { FaqSection } from './components/FaqSection'
import { Footer } from './components/Footer'
import styles from './App.module.css'

const SOFTWARE_JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Steuerpilot',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Kostenlose KI-gestützte semantische Suche in BMF-Schreiben des Bundesfinanzministeriums für Steuerberater.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'EUR',
  },
})

export default function App() {
  const [selectedSteuerart, setSelectedSteuerart] = useState<string>('')
  const [executeSearch, { data, loading, error }] =
    useLazyQuery<SearchData>(SEARCH_QUERY)

  useEffect(() => {
    document.title = 'Steuerpilot — Semantische Suche in BMF-Schreiben'
    const meta = document.querySelector('meta[name="description"]')
    const description =
      'Kostenlose KI-gestützte Suche in BMF-Schreiben des Bundesfinanzministeriums. Semantische Recherche für Steuerberater — ohne Anmeldung, DSGVO-konform.'
    if (meta) {
      meta.setAttribute('content', description)
    } else {
      const newMeta = document.createElement('meta')
      newMeta.name = 'description'
      newMeta.content = description
      document.head.appendChild(newMeta)
    }
  }, [])

  const handleSearch = (question: string): void => {
    const steuerart = selectedSteuerart || undefined
    void executeSearch({ variables: { question, steuerart } })
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Steuerpilot</h1>
        <p className={styles.subtitle}>Semantische Suche in BMF-Schreiben</p>
      </header>

      <section className={styles.valueProp}>
        <h2 className={styles.valuePropHeading}>BMF-Schreiben auf Knopfdruck verstehen</h2>
        <p className={styles.valuePropText}>
          Steuerpilot durchsucht alle aktuellen BMF-Schreiben des
          Bundesfinanzministeriums semantisch — nicht nur nach Stichworten,
          sondern nach Bedeutung. Stellen Sie Ihre Frage auf Deutsch und
          erhalten Sie eine präzise Antwort mit direkten Quellenangaben.
          Kostenlos, ohne Anmeldung, für Steuerberater und Steuerprofis.
        </p>
      </section>

      <div className={styles.statsSection}>
        <StatsBar
          selectedSteuerart={selectedSteuerart}
          onSteuerartChange={setSelectedSteuerart}
        />
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
            {data.search.sources.length > 0 ? (
              <SourceList sources={data.search.sources} />
            ) : (
              <p className={styles.noResults}>
                Keine relevanten BMF-Schreiben gefunden. Bitte formulieren
                Sie Ihre Frage spezifischer.
              </p>
            )}
          </>
        )}
      </div>

      {!data?.search && <FaqSection />}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: SOFTWARE_JSON_LD }}
      />

      <Footer />
    </div>
  )
}
