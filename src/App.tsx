import { useState, useEffect, useRef } from 'react';
import {
  loadAndIndexDictionaries,
  getDictionaryMetadata,
  getLoadProgress,
  isDataLoaded,
  getDictionaryContextMatches,
  searchTerms,
  subscribeIndexUpdates,
  type DictionaryContextMatch,
  type LoadProgress,
} from './services/dataService';
import type { DictionaryMetadata, IndexedTerm } from './types';
import { SearchBar } from './components/SearchBar';
import { TermItem } from './components/TermItem';
import { DictionaryList } from './components/DictionaryList';
import { DictionaryBrowser } from './components/DictionaryBrowser';
import './styles/components.css';

type View = 'search' | 'dictionaries' | 'dictionary';

interface AppRouteState {
  view: View;
  query: string;
  dictionaryCode: string | null;
  subject: string | null;
  bucket: string | null;
}

const FALLBACK_REPO_BASE = '/hebrew-academy-terms/';
const MIN_SEARCH_SPINNER_MS = 320;

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

function extractQueryFromUrl(location: Location, basePath: string): string {
  const queryParam = new URLSearchParams(location.search).get('q');
  if (queryParam) {
    return queryParam;
  }

  // Backward compatibility: read older path-based URLs.
  return extractQueryFromPath(location.pathname, basePath);
}

function buildSearchUrl(query: string, basePath: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return basePath;
  }

  const params = new URLSearchParams({ q: trimmed });
  return `${basePath}?${params.toString()}`;
}

function buildAppUrl(state: AppRouteState, basePath: string): string {
  if (state.view === 'search') {
    return buildSearchUrl(state.query, basePath);
  }

  const params = new URLSearchParams({ tab: 'dictionaries' });

  if (state.dictionaryCode) {
    params.set('dict', state.dictionaryCode);
  }

  if (state.subject) {
    params.set('subject', state.subject);
  }

  if (state.bucket) {
    params.set('bucket', state.bucket);
  }

  return `${basePath}?${params.toString()}`;
}

function readRouteState(location: Location, basePath: string): AppRouteState {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  const dictionaryCode = params.get('dict');
  const subject = params.get('subject');
  const bucket = params.get('bucket');
  const query = extractQueryFromUrl(location, basePath);

  if (dictionaryCode) {
    return {
      view: 'dictionary',
      query,
      dictionaryCode,
      subject,
      bucket,
    };
  }

  if (tab === 'dictionaries') {
    return {
      view: 'dictionaries',
      query,
      dictionaryCode: null,
      subject: null,
      bucket: null,
    };
  }

  return {
    view: 'search',
    query,
    dictionaryCode: null,
    subject: null,
    bucket: null,
  };
}

export default function App() {
  const [loading, setLoading] = useState(() => !isDataLoaded());
  const [routeReady, setRouteReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('search');

  const [dictionaries, setDictionaries] = useState<DictionaryMetadata[]>([]);
  const [draftQuery, setDraftQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [useVowels, setUseVowels] = useState(true);
  const [searchResults, setSearchResults] = useState<IndexedTerm[]>([]);
  const [dictionaryContextMatches, setDictionaryContextMatches] = useState<DictionaryContextMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);
  const [searchBasePath, setSearchBasePath] = useState('/');
  const [indexRevision, setIndexRevision] = useState(0);
  const lastSearchedQueryRef = useRef('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedDictCode, setSelectedDictCode] = useState<string | null>(null);
  const [selectedDictName, setSelectedDictName] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  useEffect(() => {
    const basePath = detectSearchBasePath(window.location.pathname);
    setSearchBasePath(basePath);

    const initialRoute = readRouteState(window.location, basePath);
    setView(initialRoute.view);
    setDraftQuery(initialRoute.query);
    setSubmittedQuery(initialRoute.query);
    setSelectedDictCode(initialRoute.dictionaryCode);
    setSelectedSubject(initialRoute.subject);
    setSelectedBucket(initialRoute.bucket);
    setRouteReady(true);
  }, []);

  useEffect(() => {
    if (isDataLoaded()) {
      setDictionaries(getDictionaryMetadata());
      setLoadProgress(getLoadProgress());
      setLoading(false);
      return;
    }

    let cancelled = false;

    const init = async () => {
      try {
        setLoading(true);
        setError(null);
        setLoadProgress(null);
        await loadAndIndexDictionaries({
          onProgress: (progress) => {
            if (!cancelled) {
              setLoadProgress(progress);
            }
          },
        });

        if (cancelled) {
          return;
        }

        setDictionaries(getDictionaryMetadata());
      } catch (err) {
        if (!cancelled) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError('שגיאה בטעינת הנתונים: ' + errorMsg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeIndexUpdates(() => {
      setDictionaries(getDictionaryMetadata());
      setIndexRevision((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    if (!selectedDictCode) {
      setSelectedDictName(null);
      return;
    }

    const dict = dictionaries.find((item) => item.dictionary_code === selectedDictCode);
    setSelectedDictName(dict?.dictionary_name ?? null);
  }, [dictionaries, selectedDictCode]);

  useEffect(() => {
    const handlePopState = () => {
      const route = readRouteState(window.location, searchBasePath);
      setView(route.view);
      setSelectedDictCode(route.dictionaryCode);
      setSelectedSubject(route.subject);
      setSelectedBucket(route.bucket);
      setDraftQuery(route.query);
      setSubmittedQuery(route.query);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [searchBasePath]);

  useEffect(() => {
    if (!routeReady) {
      return;
    }

    const nextUrl = buildAppUrl(
      {
        view,
        query: submittedQuery,
        dictionaryCode: selectedDictCode,
        subject: selectedSubject,
        bucket: selectedBucket,
      },
      searchBasePath
    );
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextUrl) {
      window.history.pushState({}, '', nextUrl);
    }
  }, [routeReady, submittedQuery, searchBasePath, selectedBucket, selectedDictCode, selectedSubject, view]);

  // Handle search
  useEffect(() => {
    let cancelled = false;

    if (!submittedQuery.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    if (submittedQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const loadResults = async () => {
      const queryChanged = submittedQuery !== lastSearchedQueryRef.current;
      const startedAt = performance.now();
      try {
        if (queryChanged) {
          setSearchLoading(true);
        }

        const results = await searchTerms(submittedQuery);
        if (!cancelled) {
          setSearchResults(results);
          lastSearchedQueryRef.current = submittedQuery;
        }
      } catch (err) {
        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled && queryChanged) {
          const elapsed = performance.now() - startedAt;
          const remaining = Math.max(0, MIN_SEARCH_SPINNER_MS - elapsed);
          if (remaining > 0) {
            await new Promise<void>((resolve) => {
              window.setTimeout(() => resolve(), remaining);
            });
          }
        }

        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    };

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [submittedQuery, indexRevision]);

  useEffect(() => {
    let cancelled = false;

    if (submittedQuery.trim().length < 2) {
      setDictionaryContextMatches([]);
      return;
    }

    const loadContextMatches = async () => {
      const matches = await getDictionaryContextMatches(submittedQuery);
      if (!cancelled) {
        setDictionaryContextMatches(matches);
      }
    };

    void loadContextMatches();

    return () => {
      cancelled = true;
    };
  }, [submittedQuery, indexRevision]);

  const handleSelectDictionary = (code: string) => {
    const dict = dictionaries.find((d) => d.dictionary_code === code);
    if (dict) {
      setSelectedDictCode(code);
      setSelectedDictName(dict.dictionary_name);
      setSelectedSubject(null);
      setSelectedBucket(null);
      setView('dictionary');
    }
  };

  const handleSearchSubmit = () => {
    const nextQuery = draftQuery.trim();
    if (nextQuery.length >= 2 && nextQuery !== submittedQuery) {
      setSearchLoading(true);
    }

    setSubmittedQuery(nextQuery);
  };

  const handleTermClick = (term: IndexedTerm) => {
    const termQuery = useVowels ? term.haser : term.male;
    handleSearchText(termQuery);
  };

  const handleSearchText = (queryText: string) => {
    if (queryText.trim().length >= 2 && queryText !== submittedQuery) {
      setSearchLoading(true);
    }

    setView('search');
    setSelectedDictCode(null);
    setSelectedDictName(null);
    setSelectedSubject(null);
    setSelectedBucket(null);
    setDraftQuery(queryText);
    setSubmittedQuery(queryText);

    requestAnimationFrame(() => {
      searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      searchInputRef.current?.focus();
    });
  };

  const handleRetryLoad = () => {
    setError(null);
    setLoading(true);
    setLoadProgress(null);

    void loadAndIndexDictionaries({
      onProgress: (progress) => {
        setLoadProgress(progress);
      },
    })
      .then(() => {
        setDictionaries(getDictionaryMetadata());
      })
      .catch((err) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError('שגיאה בטעינת הנתונים: ' + errorMsg);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const getSearchHref = (queryText: string) => buildSearchUrl(queryText, searchBasePath);

  const getDictionaryHref = (dictionaryCode: string) =>
    buildAppUrl(
      {
        view: 'dictionary',
        query: submittedQuery,
        dictionaryCode,
        subject: null,
        bucket: null,
      },
      searchBasePath
    );

  const getSubjectHref = (subject: string) =>
    buildAppUrl(
      {
        view: 'dictionary',
        query: submittedQuery,
        dictionaryCode: selectedDictCode,
        subject,
        bucket: null,
      },
      searchBasePath
    );

  const getBucketHref = (bucket: string) =>
    buildAppUrl(
      {
        view: 'dictionary',
        query: submittedQuery,
        dictionaryCode: selectedDictCode,
        subject: selectedSubject,
        bucket,
      },
      searchBasePath
    );

  const getContextSubjectHref = (dictionaryCode: string, subject: string) =>
    buildAppUrl(
      {
        view: 'dictionary',
        query: submittedQuery,
        dictionaryCode,
        subject,
        bucket: null,
      },
      searchBasePath
    );

  const handleBackToSearch = () => {
    setView('search');
    setSelectedDictCode(null);
    setSelectedDictName(null);
  };

  if (error) {
    return (
      <div className="app-container">
        <div className="error error-state">
          <p>{error}</p>
          <button className="secondary" onClick={handleRetryLoad}>
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  const isIndexingInBackground = loading && !loadProgress?.isComplete;
  const shouldShowSearchingState =
    searchLoading ||
    (isIndexingInBackground && submittedQuery.trim().length >= 2 && searchResults.length === 0);

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
            setSelectedDictName(null);
            setSelectedSubject(null);
            setSelectedBucket(null);
          }}
          aria-selected={view === 'dictionaries' || view === 'dictionary'}
        >
           מילונים
        </button>
      </div>

      {view === 'search' && (
        <div>
          <SearchBar
            ref={searchInputRef}
            query={draftQuery}
            onQueryChange={setDraftQuery}
            onSearch={handleSearchSubmit}
          />

          {submittedQuery.trim() && (
            <div className="results-container">
              {(shouldShowSearchingState || searchResults.length > 0) && (
                <div className="results-info results-info-row" aria-live="polite">
                  <span className="results-info-count">
                    {shouldShowSearchingState ? 'מחפש...' : `נמצאו ${searchResults.length} תוצאות`}
                  </span>
                  <span className="results-info-spinner-slot" aria-hidden={!shouldShowSearchingState}>
                    {shouldShowSearchingState ? (
                      <span className="results-spinner results-spinner-inline" aria-hidden="true" />
                    ) : null}
                  </span>
                </div>
              )}
              {submittedQuery.trim().length < 2 ? (
                <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
                  יש להזין לפחות 2 תווים לחיפוש
                </p>
              ) : searchResults.length > 0 ? (
                <div className="results-list">
                  {searchResults.map((term) => (
                    <TermItem
                      key={`${term.dictionary_code}-${term.id}-${term.male}`}
                      term={term}
                      useVowels={useVowels}
                      onTermClick={handleTermClick}
                      onSearchText={handleSearchText}
                      getSearchHref={getSearchHref}
                    />
                  ))}
                </div>
              ) : isIndexingInBackground ? (
                <></>
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
                  אין תוצאות
                </p>
              )}

              {loading && !loadProgress?.isComplete && submittedQuery.trim().length >= 2 && !shouldShowSearchingState && searchResults.length > 0 && (
                <div className="results-tail-loader" aria-live="polite" aria-label="טוען תוצאות נוספות">
                  <span className="results-spinner" aria-hidden="true" />
                </div>
              )}

              {submittedQuery.trim().length >= 2 && dictionaryContextMatches.length > 0 && (
                <div className="context-matches" aria-live="polite">
                  <ul className="context-matches-list">
                    {dictionaryContextMatches.map((match) => (
                      <li key={match.dictionary_code} className="context-match-item">
                        <a
                          className="context-dictionary-link"
                          href={getDictionaryHref(match.dictionary_code)}
                          onClick={(event) => {
                            if (
                              event.button !== 0 ||
                              event.metaKey ||
                              event.altKey ||
                              event.ctrlKey ||
                              event.shiftKey
                            ) {
                              return;
                            }

                            event.preventDefault();
                            handleSelectDictionary(match.dictionary_code);
                          }}
                        >
                          {match.dictionary_name}
                        </a>
                        {match.subjects.length > 0 ? (
                          <span className="context-match-subjects">
                            {' · '}
                            {match.subjects.map((subject, index) => (
                              <span key={`${match.dictionary_code}-${subject}`}>
                                <a
                                  className="context-subject-link"
                                  href={getContextSubjectHref(match.dictionary_code, subject)}
                                  onClick={(event) => {
                                    if (
                                      event.button !== 0 ||
                                      event.metaKey ||
                                      event.altKey ||
                                      event.ctrlKey ||
                                      event.shiftKey
                                    ) {
                                      return;
                                    }

                                    event.preventDefault();
                                    setView('dictionary');
                                    setSelectedDictCode(match.dictionary_code);
                                    setSelectedSubject(subject);
                                    setSelectedBucket(null);
                                  }}
                                >
                                  {subject}
                                </a>
                                {index < match.subjects.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="context-match-subjects"> · ללא נושאים תואמים</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <footer className="app-footer hebrew-text">
            כל הזכויות שמורות לאקדמיה ללשון העברית
          </footer>
        </div>
      )}

      {view === 'dictionaries' && !selectedDictCode && (
        <DictionaryList
          dictionaries={dictionaries}
          onSelectDictionary={handleSelectDictionary}
          getDictionaryHref={getDictionaryHref}
        />
      )}

      {view === 'dictionary' && selectedDictCode && selectedDictName && (
        <DictionaryBrowser
          dictionaryName={selectedDictName}
          dictionaryCode={selectedDictCode}
          useVowels={useVowels}
          selectedSubject={selectedSubject}
          selectedBucket={selectedBucket}
          onSelectSubject={setSelectedSubject}
          onSelectBucket={setSelectedBucket}
          getSubjectHref={getSubjectHref}
          getBucketHref={getBucketHref}
          onTermClick={handleTermClick}
          onSearchText={handleSearchText}
          getSearchHref={getSearchHref}
        />
      )}
    </div>
  );
}
