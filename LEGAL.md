# Legal Considerations

## What This Tool Does — and Does Not Do

| Does | Does Not |
|---|---|
| Fetch PDFs temporarily into memory | Store PDFs on server |
| Store vectors + metadata in MongoDB | Reproduce original text to users |
| Return LLM-generated answers in its own words | Serve original documents |
| Link back to bundesfinanzministerium.de | Lock content behind login |

This approach mirrors how search engines operate: index, don't host.

---

## Copyright — §5 UrhG (Amtliche Werke)

BMF-Schreiben may qualify as **amtliche Werke** under §5 Abs. 1 UrhG, exempting them from copyright protection:

> "Gesetze, Verordnungen, amtliche Erlasse und Bekanntmachungen [...] genießen keinen urheberrechtlichen Schutz."

**Argument for exemption:** BMF-Schreiben are official administrative rulings published explicitly for public information. They define binding administrative practice.

**Argument against:** The exact scope of §5 UrhG applied to ministerial letters is not definitively settled in German case law.

**Practical assessment:** All major German legal publishers (DATEV, Haufe, NWB, Beck) index and commercialise the same documents without known legal challenge from the BMF. The risk for a free, non-commercial demo tool is negligible.

For a production application, a short opinion from a German IP lawyer is recommended (~€200–300).

---

## robots.txt — bundesfinanzministerium.de

As of March 2026:

```
User-agent: *
Crawl-delay: 180

Disallow: /SiteGlobals/
Disallow: /SharedDocs/
# /Content/DE/ is NOT disallowed
```

**Implications:**

- 180-second crawl delay between requests → strictly enforced in ingestion pipeline
- `/Content/DE/Downloads/BMF_Schreiben/` → access permitted
- RSS feed via `/SiteGlobals/` → disallowed for bots; use listing page scraping instead

---

## Data Minimisation

In line with GDPR best practices:

- No user data stored — no login, no account, no query logging
- No cookies beyond technically necessary session handling
- No analytics in base version

---

## Disclaimer Text (displayed in UI)

> **Demo / Proof of Concept** — This project is an experimental tool built to explore RAG pipelines applied to German tax law. It is free to use, provided as-is, with no guarantees of accuracy, completeness or availability. Nothing in this tool constitutes legal or tax advice. Always consult a licensed Steuerberater for binding guidance. Maßgeblich ist stets das Originaldokument auf bundesfinanzministerium.de.
