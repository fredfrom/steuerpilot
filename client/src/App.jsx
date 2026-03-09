import { useState } from "react";
import { gql, useLazyQuery } from "@apollo/client";

const SEARCH_QUERY = gql`
  query Search($question: String!, $steuerart: String) {
    search(question: $question, steuerart: $steuerart) {
      answer
      sources {
        title
        date
        gz
        steuerart
        bmfUrl
        relevanceScore
      }
    }
  }
`;

function App() {
  const [question, setQuestion] = useState("");
  const [executeSearch, { data, loading, error }] = useLazyQuery(SEARCH_QUERY);

  const handleSearch = (e) => {
    e.preventDefault();
    if (question.trim()) {
      executeSearch({ variables: { question } });
    }
  };

  return (
    <div>
      <h1>Steuerpilot</h1>
      <p>Semantische Suche in BMF-Schreiben</p>

      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Stellen Sie Ihre Frage zum Steuerrecht..."
        />
        <button type="submit" disabled={loading}>
          {loading ? "Suche..." : "Suchen"}
        </button>
      </form>

      <div>
        {error && <p>Fehler: {error.message}</p>}

        {data?.search && (
          <div>
            <h2>Antwort</h2>
            <p>{data.search.answer}</p>

            {data.search.sources.length > 0 && (
              <div>
                <h3>Quellen</h3>
                <ul>
                  {data.search.sources.map((source, i) => (
                    <li key={i}>
                      <a href={source.bmfUrl} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>{" "}
                      — {source.date} ({source.steuerart})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
