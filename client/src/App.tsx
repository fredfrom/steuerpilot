import { useState, useEffect } from 'react'
import { useQuery, useLazyQuery } from '@apollo/client/react'
import {
  SEARCH_QUERY,
  STATS_QUERY,
  type SearchData,
  type StatsData,
} from './graphql/queries'
import { Header } from './components/Header'
import { SearchForm } from './components/SearchForm'
import { AnswerDisplay } from './components/AnswerDisplay'
import { SourceList } from './components/SourceList'
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
  const { data: statsData } = useQuery<StatsData>(STATS_QUERY)
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

  const totalDocuments = statsData?.stats.totalDocuments
  const lastUpdated = statsData?.stats.lastUpdated
  const categories = statsData?.stats.byCategory ?? []

  return (
    <>
      <Header lastUpdated={lastUpdated} />

      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.eyebrow}>Semantische Steuerrecherche</div>
          <h1 className={styles.heroTitle}>
            BMF-Schreiben
            <br />
            <em>endlich verständlich</em>
          </h1>
          <p className={styles.heroDesc}>
            KI-gestützte Suche in allen aktuellen Verwaltungsanweisungen des
            Bundesfinanzministeriums. Für Steuerberater, die präzise Antworten
            mit direkten Quellenangaben brauchen.
          </p>

          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>
                {totalDocuments ?? '—'}
              </span>
              <span className={styles.statLabel}>BMF-Schreiben</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statNumber}>Täglich</span>
              <span className={styles.statLabel}>
                Automatisch aktualisiert
              </span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statNumber}>Kostenlos</span>
              <span className={styles.statLabel}>Keine Anmeldung nötig</span>
            </div>
          </div>

          <SearchForm
            onSearch={handleSearch}
            loading={loading}
            categories={categories}
            selectedSteuerart={selectedSteuerart}
            onSteuerartChange={setSelectedSteuerart}
          />
        </div>
      </div>

      <main className={styles.content}>
        {loading && <LoadingSpinner />}

        {error && <ErrorMessage message={error.message} />}

        {data?.search && (
          <>
            <AnswerDisplay answer={data.search.answer} />
            {data.search.sources.length > 0 ? (
              <SourceList sources={data.search.sources} />
            ) : (
              <p className={styles.noResults}>
                Keine relevanten BMF-Schreiben gefunden. Bitte formulieren Sie
                Ihre Frage spezifischer.
              </p>
            )}
          </>
        )}

        {!data?.search && <FaqSection />}
      </main>

      <div className={styles.footerDisclaimer}>
        <p>
          <strong>Haftungsausschluss:</strong> Steuerpilot ersetzt keine
          steuerliche oder rechtliche Beratung. Alle Antworten dienen
          ausschließlich der ersten Orientierung. Prüfen Sie stets die
          verlinkten Originalquellen des Bundesfinanzministeriums. Keine Gewähr
          für Vollständigkeit, Richtigkeit oder Aktualität. Dieses Tool ist ein
          nicht-kommerzielles Demonstrationsprojekt ohne Erwerbszweck.
        </p>
      </div>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: SOFTWARE_JSON_LD }}
      />
    </>
  )
}
