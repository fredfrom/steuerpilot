import { useState } from 'react'
import styles from './FaqSection.module.css'

interface FaqItem {
  question: string
  answer: string
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Was ist Steuerpilot?',
    answer:
      'Steuerpilot ist eine kostenlose, KI-gestützte Suchmaschine für BMF-Schreiben des Bundesfinanzministeriums. Sie durchsucht alle aktuellen Verwaltungsanweisungen semantisch — nicht nur nach Stichworten, sondern nach inhaltlicher Bedeutung.',
  },
  {
    question: 'Welche Quellen werden durchsucht?',
    answer:
      'Steuerpilot durchsucht ausschließlich offizielle BMF-Schreiben (Verwaltungsanweisungen des Bundesfinanzministeriums). Diese werden automatisch aus dem RSS-Feed des BMF importiert und regelmäßig aktualisiert.',
  },
  {
    question: 'Ist die Nutzung DSGVO-konform?',
    answer:
      'Ja. Steuerpilot lädt keine externen Schriftarten, Skripte oder Tracker. Alle Assets werden vom eigenen Server ausgeliefert. Es werden keine personenbezogenen Daten gespeichert — weder Suchanfragen noch IP-Adressen.',
  },
  {
    question: 'Für wen ist Steuerpilot gedacht?',
    answer:
      'Steuerpilot richtet sich an Steuerberater, Steuerfachangestellte und alle Fachleute, die schnell und präzise in BMF-Schreiben recherchieren möchten. Die Antworten enthalten stets direkte Quellenangaben.',
  },
  {
    question: 'Wie aktuell sind die Daten?',
    answer:
      'Die BMF-Schreiben werden täglich automatisch aus dem offiziellen RSS-Feed des Bundesfinanzministeriums aktualisiert. Neue Verwaltungsanweisungen stehen in der Regel innerhalb von 24 Stunden zur Verfügung.',
  },
]

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number): void => {
    setOpenIndex((prev) => (prev === index ? null : index))
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Häufig gestellte Fragen</h2>
      <div className={styles.accordion}>
        {FAQ_ITEMS.map((item, index) => (
          <div key={item.question} className={styles.item}>
            <button
              className={styles.question}
              onClick={() => toggle(index)}
              aria-expanded={openIndex === index}
            >
              {item.question}
              <span
                className={`${styles.chevron} ${openIndex === index ? styles.chevronOpen : ''}`}
              >
                ▼
              </span>
            </button>
            {openIndex === index && (
              <div className={styles.answer}>{item.answer}</div>
            )}
          </div>
        ))}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ_ITEMS.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
              },
            })),
          }),
        }}
      />
    </section>
  )
}
