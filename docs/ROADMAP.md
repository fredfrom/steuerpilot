# Roadmap

## MVP — build now (24–48h)

Goal: publicly deployable demo, no credit card, fully functional.

### F1 · Semantic Search over BMF-Schreiben

- Natural language text input in German
- Vector search + LLM answer generation
- Source citation per answer: date, Aktenzeichen, Steuerart, clickable PDF link

### F2 · Automatic Data Updates

- Daily cron job scrapes new BMF-Schreiben from bundesfinanzministerium.de
- Only new documents are processed (URL + version as dedup key)
- No manual maintenance required

### F3 · Filter by Steuerart

- Dropdown: Einkommensteuer · Umsatzsteuer · Körperschaftsteuer · Lohnsteuer · All
- Scopes vector search to selected category

### F4 · Transparency

- Total indexed documents + last update date visible in UI
- Each answer shows sources with relevance score
- Prominent disclaimer on every page

### F5 · Responsive UI

- Mobile-first, React, clean minimal design
- No login, no registration — works immediately

---

## Later

### N1 · Topic Subscriptions & Email Notifications

User subscribes to topics and receives email when new BMF-Schreiben are published in that area.

Suggested topics:
- Homeoffice / Arbeitszimmer
- Kryptowährungen / digitale Assets
- E-Auto / Firmenwagen
- GmbH-Gründung / Körperschaftsteuer
- Umsatzsteuer / E-Rechnung
- Erbschaft- und Schenkungsteuer
- Photovoltaik

Requires: user account (email only), Resend or SendGrid free tier.

### N2 · Change Tracking

When a BMF-Schreiben supersedes or amends an earlier one, link them.

- `"This ruling supersedes: [link]"`
- `"Superseded by: [link]"`

Requires: parsing "Bezug" and "Betreff" fields in BMF documents.

### N3 · Date Range Filter

Scope search to: last year · last 2 years · from date · to date.
Already prepared by metadata storage.

### N4 · Related Documents

"Related BMF-Schreiben" section under each answer.
Based on vector similarity between documents, not keywords.

### N5 · Multilingual

Ask questions in English, receive answers in German or English.
Useful for international companies operating in Germany.

### N6 · Public GraphQL API / Playground

Public Apollo Studio playground for developers.
Demonstrates technical depth, useful as a portfolio signal.

### N7 · Steuerart Overview Pages

Per Steuerart: document count, most recent date, most referenced paragraphs.
Entry point for users without a specific question.

### N8 · BFH Case Law (long-term)

The Bundesfinanzhof publishes rulings publicly.
Combining BMF-Schreiben + BFH case law would be significant added value over existing tools.
Separate project — considerably higher complexity.
