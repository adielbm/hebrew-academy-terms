import { useState, useEffect } from 'react';
import {
  loadAndIndexDictionaries,
  getDictionaryMetadata,
  searchTerms,
} from './services/dataService';
import { IndexedTerm, DictionaryMetadata } from './types';
import { SearchBar } from './components/SearchBar';
import { TermItem } from './components/TermItem';
import { DictionaryList } from './components/DictionaryList';
import { DictionaryBrowser } from './components/DictionaryBrowser';
import './styles/components.css';

type View = 'search' | 'dictionaries' | 'dictionary';

const FALLBACK_REPO_BASE = '/hebrew-academy-terms/';

function normalizeBasePath(path: string): string {
  if (!path.startsWith('/')) {
    return '/';
  }

  return path.endsWith('/') ? path : `${path}/`;
}

function detectSearchBasePath(pathname: string): string {
  const configuredBasePath = normalizeBasePath(import.meta.env.BASE_URL || '/');

  if (configuredBasePath !== '/') {
    return configuredBasePath;
  }

  if (pathname.startsWith(FALLBACK_REPO_BASE)) {
    return FALLBACK_REPO_BASE;
  }

  return '/';
}

function extractQueryFromPath(pathname: string, basePath: string): string {
  if (!pathname.startsWith(basePath)) {
    return '';
  }

  const rest = pathname.slice(basePath.length).replace(/^\/+/, '');
  if (!rest) {
    return '';
  }

  const firstSegment = rest.split('/')[0];

  try {
    return decodeURIComponent(firstSegment);
  } catch {
    return firstSegment;
  }
}

function buildSearchPath(query: string, basePath: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return basePath;
  }

  return `${basePath}${encodeURIComponent(trimmed)}`;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('search');
  
  const [dictionaries, setDictionaries] = useState<DictionaryMetadata[]>([]);
  const [draftQuery, setDraftQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [useVowels, setUseVowels] = useState(true);
  const [searchResults, setSearchResults] = useState<IndexedTerm[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchBasePath, setSearchBasePath] = useState('/');
  
  const [selectedDictCode, setSelectedDictCode] = useState<string | null>(null);
  const [selectedDictName, setSelectedDictName] = useState<string | null>(null);

  // Initialize data
  useEffect(() => {
    const basePath = detectSearchBasePath(window.location.pathname);
    setSearchBasePath(basePath);

    const queryFromPath = extractQueryFromPath(window.location.pathname, basePath);
    if (queryFromPath) {
      setView('search');
      setDraftQuery(queryFromPath);
      setSubmittedQuery(queryFromPath);
    }

    const init = async () => {
      try {
        console.log('Starting data initialization...');
        setLoading(true);
        await loadAndIndexDictionaries();
        console.log('Data loaded successfully');
        const dicts = getDictionaryMetadata();
        console.log('Dictionaries retrieved:', dicts.length);
        setDictionaries(dicts);
        setError(null);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Data initialization failed:', err);
        setError('שגיאה בטעינת הנתונים: ' + errorMsg);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const nextQuery = extractQueryFromPath(window.location.pathname, searchBasePath);
      setView('search');
      setSelectedDictCode(null);
      setSelectedDictName(null);
      setDraftQuery(nextQuery);
      setSubmittedQuery(nextQuery);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [searchBasePath]);

  useEffect(() => {
    const nextPath = buildSearchPath(submittedQuery, searchBasePath);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  }, [submittedQuery, searchBasePath]);

  // Handle search
  useEffect(() => {
    let cancelled = false;

    if (!submittedQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (submittedQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const loadResults = async () => {
      try {
        setSearchLoading(true);
        const results = await searchTerms(submittedQuery);
        if (!cancelled) {
          setSearchResults(results);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    };

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [submittedQuery]);

  const handleSelectDictionary = (code: string) => {
    const dict = dictionaries.find((d) => d.dictionary_code === code);
    if (dict) {
      setSelectedDictCode(code);
      setSelectedDictName(dict.dictionary_name);
      setView('dictionary');
    }
  };

  const handleSearchSubmit = () => {
    setSubmittedQuery(draftQuery.trim());
  };

  const handleTermClick = (term: IndexedTerm) => {
    const termQuery = useVowels ? term.hebrew_with_vowels : term.hebrew_without_vowels;
    handleSearchText(termQuery);
  };

  const handleSearchText = (queryText: string) => {
    setView('search');
    setDraftQuery(queryText);
    setSubmittedQuery(queryText);
  };

  const getSearchHref = (queryText: string) => buildSearchPath(queryText, searchBasePath);

  const handleBackToDictionary = () => {
    setView('dictionaries');
    setSelectedDictCode(null);
    setSelectedDictName(null);
  };

  const handleBackToSearch = () => {
    setView('search');
    setSelectedDictCode(null);
    setSelectedDictName(null);
  };

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading">
          <h2>טוען מילונים...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-container">
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="spelling-toggle spelling-toggle-page" aria-label="בחירת כתיב">
        <button
          className="secondary"
          onClick={() => setUseVowels((prev) => !prev)}
          aria-pressed={useVowels}
          aria-label={useVowels ? 'עבור לכתיב חסר' : 'עבור לכתיב מלא'}
        >
          {useVowels ? 'כתיב מלא' : 'כתיב חסר'}
        </button>
      </div>

      <div className="app-header">
        <h1 className="hebrew-text">מונחי האקדמיה ללשון העברית</h1>
        <p className="hebrew-text">המילונים המקצועיים והמילים בשימוש כללי של ועד הלשון ושל האקדמיה ללשון העברית</p>
        <p
          style={{ fontWeight: 'bold', color: '#93271e' }}
          className="hebrew-text"
        >
          כל הזכויות שמורות לאקדמיה ללשון העברית
        </p>

      </div>

      <div className="view-tabs">
        <button
          className={`view-tab ${view === 'search' ? 'active' : ''}`}
          onClick={handleBackToSearch}
          aria-selected={view === 'search'}
        >
          חיפוש
        </button>
        <button
          className={`view-tab ${view === 'dictionaries' || view === 'dictionary' ? 'active' : ''}`}
          onClick={() => {
            setView('dictionaries');
            setSelectedDictCode(null);
          }}
          aria-selected={view === 'dictionaries' || view === 'dictionary'}
        >
          עיין במילונים
        </button>
      </div>

      {view === 'search' && (
        <div>
          <SearchBar
            query={draftQuery}
            onQueryChange={setDraftQuery}
            onSearch={handleSearchSubmit}
          />

          {submittedQuery.trim() && (
            <div className="results-container">
              <div className="results-info">
                נמצאו {searchResults.length} תוצאות
              </div>
              {submittedQuery.trim().length < 2 ? (
                <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
                  יש להזין לפחות 2 תווים לחיפוש
                </p>
              ) : searchLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
                  מחפש...
                </p>
              ) : searchResults.length > 0 ? (
                <div className="results-list">
                  {searchResults.map((term, index) => (
                    <TermItem
                      key={`${term.dictionary_code}-${term.id}-${term.hebrew_without_vowels}-${index}`}
                      term={term}
                      useVowels={useVowels}
                      onTermClick={handleTermClick}
                      onSearchText={handleSearchText}
                      getSearchHref={getSearchHref}
                    />
                  ))}
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
                  לא נמצאו תוצאות
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {view === 'dictionaries' && !selectedDictCode && (
        <DictionaryList
          dictionaries={dictionaries}
          onSelectDictionary={handleSelectDictionary}
        />
      )}

      {view === 'dictionary' && selectedDictCode && selectedDictName && (
        <DictionaryBrowser
          dictionaryName={selectedDictName}
          dictionaryCode={selectedDictCode}
          useVowels={useVowels}
          onTermClick={handleTermClick}
          onSearchText={handleSearchText}
          getSearchHref={getSearchHref}
          onBack={handleBackToDictionary}
        />
      )}
    </div>
  );
}
