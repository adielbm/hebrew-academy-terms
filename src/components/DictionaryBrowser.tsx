import { useState, useEffect, FC } from 'react';
import { IndexedTerm } from '../types';
import { TermItem } from './TermItem';
import { searchTerms } from '../services/dataService';

interface DictionaryBrowserProps {
  dictionaryName: string;
  dictionaryCode: string;
  useVowels: boolean;
  onTermClick: (term: IndexedTerm) => void;
  onSearchText: (query: string) => void;
  onBack: () => void;
}

export const DictionaryBrowser: FC<DictionaryBrowserProps> = ({
  dictionaryName,
  dictionaryCode,
  useVowels,
  onTermClick,
  onSearchText,
  onBack,
}) => {
  const [draftQuery, setDraftQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<IndexedTerm[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!submittedQuery.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    if (submittedQuery.trim().length < 2) {
      setResults([]);
      setError('יש להזין לפחות 2 תווים לחיפוש.');
      return;
    }

    const loadResults = async () => {
      try {
        setLoading(true);
        setError(null);
        const nextResults = await searchTerms(submittedQuery, dictionaryCode);
        if (!cancelled) {
          setResults(nextResults);
        }
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          setError('אירעה שגיאה בחיפוש במילון.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [submittedQuery, dictionaryCode]);

  const handleSearch = () => {
    setSubmittedQuery(draftQuery.trim());
  };

  return (
    <div className="dictionary-browser">
      <div className="dictionary-header">
        <button onClick={onBack} className="secondary">
          חזור
        </button>
        <div>
          <h2 className="hebrew-text" style={{ margin: 0 }}>
            {dictionaryName}
          </h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-light)' }}>
            חיפוש מונחים בתוך המילון
          </p>
        </div>
      </div>

      <div className="dictionary-search">
        <input
          type="search"
          placeholder="חפש בתוך המילון..."
          value={draftQuery}
          onChange={(e) => {
            setDraftQuery(e.target.value);
          }}
          aria-label="חיפוש בתוך המילון"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch();
            }
          }}
        />
        <button onClick={handleSearch} aria-label="חפש בתוך המילון">
          חפש
        </button>
      </div>

      <div className="results-container">
        {!submittedQuery ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
            הקלידו מונח ולחצו על חיפוש
          </p>
        ) : loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
            מחפש...
          </p>
        ) : error ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
            {error}
          </p>
        ) : results.length > 0 ? (
          <>
            <div className="results-info">
              נמצאו {results.length} תוצאות
            </div>
            <div className="results-list">
              {results.map((term, index) => (
                <TermItem
                  key={`${term.dictionary_code}-${term.id}-${term.hebrew_without_vowels}-${index}`}
                  term={term}
                  useVowels={useVowels}
                  onTermClick={onTermClick}
                  onSearchText={onSearchText}
                />
              ))}
            </div>
          </>
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
            לא נמצאו מונחים
          </p>
        )}
      </div>
    </div>
  );
};
