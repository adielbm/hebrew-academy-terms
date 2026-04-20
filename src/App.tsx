import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import {
  hydrateDataFromPersistence,
  loadAndIndexDictionariesFromUrl,
  loadAndIndexDictionariesFromFile,
  getDictionaryMetadata,
  getLoadProgress,
  isDataLoaded,
  getDictionaryContextMatches,
  searchTerms,
  subscribeIndexUpdates,
  isDataFileUnavailableError,
  type DictionaryContextMatch,
  type LoadProgress,
} from './services/dataService';
import type { DictionaryMetadata, IndexedTerm } from './types';
import { SearchBar } from './components/SearchBar';
import { TermItem } from './components/TermItem';
import { DictionaryList } from './components/DictionaryList';
import { DictionaryBrowser } from './components/DictionaryBrowser';
import './styles/components.css';

type View = 'search' | 'dictionaries' | 'dictionary' | 'preferences';
type DataSourceMode = 'url' | 'local';

interface AppRouteState {
  view: View;
  query: string;
  dictionaryCode: string | null;
  subject: string | null;
  bucket: string | null;
}

const FALLBACK_REPO_BASE = '/hebrew-academy-terms/';
const MIN_SEARCH_SPINNER_MS = 320;
const DATA_SOURCE_MODE_KEY = 'dataSourceMode';
const DATA_SOURCE_URL_KEY = 'dataSourceUrl';
const DEBUG_MODE_KEY = 'debugMode';

function isValidExternalDataUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    return isHttp && parsed.origin !== window.location.origin;
  } catch {
    return false;
  }
}

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

  const params = new URLSearchParams({ tab: state.view === 'preferences' ? 'preferences' : 'dictionaries' });

  if (state.view === 'preferences') {
    return `${basePath}?${params.toString()}`;
  }

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

  if (tab === 'preferences') {
    return {
      view: 'preferences',
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
  const [isMissingBundledData, setIsMissingBundledData] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preferencesLabel, setPreferencesLabel] = useState<string | null>(null);
  const [isUploadingLocalData, setIsUploadingLocalData] = useState(false);
  const [view, setView] = useState<View>('search');
  const [activeDataSourceMode, setActiveDataSourceMode] = useState<DataSourceMode>('local');
  const [activeDataSourceUrl, setActiveDataSourceUrl] = useState('');
  const [draftDataSourceMode, setDraftDataSourceMode] = useState<DataSourceMode>('local');
  const [draftDataSourceUrl, setDraftDataSourceUrl] = useState('');
  const [debugMode, setDebugMode] = useState(() => window.localStorage.getItem(DEBUG_MODE_KEY) === 'true');

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
  const historyActionRef = useRef<'push' | 'replace'>('push');
  const navigationSourceRef = useRef<'push' | 'pop'>('push');

  const formatBytes = (value: number | null): string => {
    if (value == null || Number.isNaN(value)) {
      return '-';
    }

    if (value < 1024) {
      return `${value} B`;
    }

    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  };

  const debugLog = (
    level: 'info' | 'warn' | 'error',
    message: string,
    details?: unknown
  ) => {
    if (!debugMode) {
      return;
    }

    const logger = console[level] ?? console.log;
    if (details !== undefined) {
      logger.call(console, message, details);
    } else {
      logger.call(console, message);
    }
  };

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

  const loadDataFromSelectedSource = async (
    sourceMode: DataSourceMode,
    sourceUrl: string,
    forceReload = false
  ) => {
    if (isDataLoaded() && !forceReload) {
      setDictionaries(getDictionaryMetadata());
      setLoadProgress(getLoadProgress());
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setUploadError(null);
      setPreferencesLabel(null);
      setIsMissingBundledData(false);
      setLoadProgress(null);

      debugLog('info', '[data] loading', { sourceMode, sourceUrl, forceReload });

      const hydrated = await hydrateDataFromPersistence({
        onProgress: (progress) => {
          setLoadProgress(progress);
        },
      });

      if (hydrated) {
        setDictionaries(getDictionaryMetadata());
        return;
      }

      if (sourceMode === 'local') {
        setPreferencesLabel('בחרו קובץ data.json מהמחשב כדי לטעון את הנתונים.');
        debugLog('warn', '[data] no local file selected');
        return;
      }

      await loadAndIndexDictionariesFromUrl(sourceUrl, {
        onProgress: (progress) => {
          setLoadProgress(progress);
        },
      });

      setDictionaries(getDictionaryMetadata());
      setPreferencesLabel('הנתונים נטענו מהכתובת שנבחרה.');
      debugLog('info', '[data] loaded from url');
    } catch (err) {
      if (isDataFileUnavailableError(err)) {
        setIsMissingBundledData(true);
        setError(null);
        debugLog('warn', '[data] bundled data unavailable');
        return;
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      setError('שגיאה בטעינת הנתונים: ' + errorMsg);
      debugLog('error', '[data] load failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const persistedMode = window.localStorage.getItem(DATA_SOURCE_MODE_KEY);
    const persistedUrl = window.localStorage.getItem(DATA_SOURCE_URL_KEY);

    const normalizedPersistedUrl = persistedUrl?.trim() || '';
    const persistedUrlIsExternal = isValidExternalDataUrl(normalizedPersistedUrl);
    const nextMode: DataSourceMode = persistedMode === 'url' && persistedUrlIsExternal ? 'url' : 'local';
    const nextUrl = persistedUrlIsExternal ? normalizedPersistedUrl : '';

    setActiveDataSourceMode(nextMode);
    setActiveDataSourceUrl(nextUrl);
    setDraftDataSourceMode(nextMode);
    setDraftDataSourceUrl(nextUrl);

    void loadDataFromSelectedSource(nextMode, nextUrl);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DEBUG_MODE_KEY, String(debugMode));
  }, [debugMode]);

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
      navigationSourceRef.current = 'pop';
      const route = readRouteState(window.location, searchBasePath);
      debugLog('info', '[route] popstate', route);
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
      const nextHistoryAction = historyActionRef.current;
      historyActionRef.current = 'push';
      debugLog('info', '[route] sync', {
        currentUrl,
        nextUrl,
        action: nextHistoryAction,
        view,
        dictionaryCode: selectedDictCode,
        subject: selectedSubject,
        bucket: selectedBucket,
      });

      if (nextHistoryAction === 'replace') {
        window.history.replaceState({}, '', nextUrl);
      } else {
        window.history.pushState({}, '', nextUrl);
      }
    }
  }, [routeReady, submittedQuery, searchBasePath, selectedBucket, selectedDictCode, selectedSubject, view]);

  useEffect(() => {
    if (view === 'search') {
      const trimmedQuery = submittedQuery.trim();
      document.title = trimmedQuery ? trimmedQuery : 'מונחי האקדמיה ללשון העברית';
      return;
    }

    if (view === 'dictionaries') {
      document.title = 'מילונים';
      return;
    }

    if (view === 'dictionary') {
      if (selectedSubject) {
        document.title = selectedSubject;
        return;
      }

      if (selectedDictName) {
        document.title = selectedDictName;
        return;
      }

      document.title = 'מונחי האקדמיה ללשון העברית';
      return;
    }

    if (view === 'preferences') {
      document.title = 'העדפות';
      return;
    }

    document.title = 'מונחי האקדמיה ללשון העברית';
  }, [selectedBucket, selectedDictName, selectedSubject, submittedQuery, view]);

  const scrollPageTop = () => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  // Handle search
  useEffect(() => {
    let cancelled = false;

    if (!isDataLoaded()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

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

    if (!isDataLoaded()) {
      setDictionaryContextMatches([]);
      return;
    }

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
    navigationSourceRef.current = 'push';
    const dict = dictionaries.find((d) => d.dictionary_code === code);
    if (dict) {
      scrollPageTop();
      setSelectedDictCode(code);
      setSelectedDictName(dict.dictionary_name);
      setSelectedSubject(null);
      setSelectedBucket(null);
      setView('dictionary');
    }
  };

  const handleOpenDictionary = (code: string, replaceHistory = false) => {
    navigationSourceRef.current = 'push';
    if (replaceHistory) {
      historyActionRef.current = 'replace';
    }

    handleSelectDictionary(code);
  };

  const handleOpenDictionarySubject = (
    code: string,
    subject: string,
    replaceHistory = false
  ) => {
    navigationSourceRef.current = 'push';
    if (replaceHistory) {
      historyActionRef.current = 'replace';
    }

    const dict = dictionaries.find((item) => item.dictionary_code === code);
    if (!dict) {
      return;
    }

    scrollPageTop();
    setSelectedDictCode(code);
    setSelectedDictName(dict.dictionary_name);
    setSelectedSubject(subject);
    setSelectedBucket(null);
    setView('dictionary');
  };

  const handleSelectSubject = (subject: string | null, replaceHistory = false) => {
    navigationSourceRef.current = 'push';
    if (replaceHistory) {
      historyActionRef.current = 'replace';
    }

    setSelectedSubject(subject);
    setSelectedBucket(null);
  };

  const handleSelectBucket = (bucket: string | null, replaceHistory = false) => {
    navigationSourceRef.current = 'push';
    if (replaceHistory) {
      historyActionRef.current = 'replace';
    }

    setSelectedBucket(bucket);
  };

  const handleSearchSubmit = () => {
    navigationSourceRef.current = 'push';
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
    navigationSourceRef.current = 'push';
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
      searchInputRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' });
      searchInputRef.current?.focus();
    });
  };

  const handleLocalDataUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsUploadingLocalData(true);
    setUploadError(null);
    setError(null);
    setPreferencesLabel(null);
    setLoadProgress(null);

    try {
      await loadAndIndexDictionariesFromFile(file, {
        onProgress: (progress) => {
          setLoadProgress(progress);
        },
      });

      setActiveDataSourceMode('local');
      setDraftDataSourceMode('local');
      window.localStorage.setItem(DATA_SOURCE_MODE_KEY, 'local');
      setDictionaries(getDictionaryMetadata());
      setIsMissingBundledData(false);
      setPreferencesLabel('הקובץ המקומי נטען ונשמר בדפדפן.');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setUploadError('טעינת הקובץ המקומי נכשלה: ' + errorMsg);
    } finally {
      setIsUploadingLocalData(false);
      setLoading(false);
    }
  };

  const handleSavePreferences = () => {
    navigationSourceRef.current = 'push';
    const normalizedMode: DataSourceMode = draftDataSourceMode === 'local' ? 'local' : 'url';
    const normalizedUrl = draftDataSourceUrl.trim();

    if (normalizedMode === 'url' && !isValidExternalDataUrl(normalizedUrl)) {
      setPreferencesLabel('כדי להוריד נתונים מכתובת, יש להזין URL חיצוני מלא (http/https).');
      return;
    }

    setActiveDataSourceMode(normalizedMode);
    setActiveDataSourceUrl(normalizedUrl);

    window.localStorage.setItem(DATA_SOURCE_MODE_KEY, normalizedMode);
    window.localStorage.setItem(DATA_SOURCE_URL_KEY, normalizedUrl);

    setDraftDataSourceUrl(normalizedUrl);
    setPreferencesLabel('ההעדפות נשמרו.');

    void loadDataFromSelectedSource(normalizedMode, normalizedUrl, true);
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
    navigationSourceRef.current = 'push';
    setView('search');
    setSelectedDictCode(null);
    setSelectedDictName(null);
  };

  const totalTermsInDb = dictionaries.reduce((sum, dictionary) => {
    const count = Number(dictionary.terms_count);
    return Number.isFinite(count) ? sum + count : sum;
  }, 0);
  const indexingPercentage = (() => {
    if (!loadProgress) {
      return null;
    }

    if (loadProgress.isComplete) {
      return 100;
    }

    if (totalTermsInDb <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((loadProgress.indexedTerms / totalTermsInDb) * 100));
  })();
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
            navigationSourceRef.current = 'push';
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
        <button
          className={`view-tab ${view === 'preferences' ? 'active' : ''}`}
          onClick={() => {
            navigationSourceRef.current = 'push';
            setView('preferences');
          }}
          aria-selected={view === 'preferences'}
        >
          העדפות
        </button>
      </div>

      {(error || isMissingBundledData) ? (
        <div className={error ? 'error error-state' : 'status-state notice-state'}>
          {error ? <p>{error}</p> : null}
          {isMissingBundledData ? (
            <>
              <p>לא מצאנו את קובץ הנתונים בכתובת שנבחרה.</p>
              <p>כדי להמשיך, פותחים את לשונית "העדפות" ובוחרים כתובת אחרת או קובץ מקומי.</p>
              <button className="secondary" onClick={() => setView('preferences')}>
                פתח העדפות
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {view === 'search' && (
        <div>
          {!isDataLoaded() && !loading ? (
            <div className="status-state notice-state">
              <p>כדי להתחיל, יש לטעון נתונים בלשונית "העדפות".</p>
              <button className="secondary" onClick={() => setView('preferences')}>
                פתח העדפות
              </button>
            </div>
          ) : null}

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
                      getDictionaryHref={getDictionaryHref}
                      getSubjectHref={getSubjectHref}
                      onOpenDictionary={handleOpenDictionary}
                      onOpenDictionarySubject={handleOpenDictionarySubject}
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
                            handleOpenDictionary(match.dictionary_code);
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
                                    handleOpenDictionarySubject(match.dictionary_code, subject);
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

          <footer className="app-footer">
              <div>
                  כל הזכויות שמורות לאקדמיה ללשון העברית
              </div>
              <div style={{direction: 'ltr'}}>
                source code: <br />
                <a href="https://github.com/adielbm/hebrew-academy-terms/" target="_blank" rel="noreferrer">github.com/adielbm/hebrew-academy-terms</a>
              </div>
          </footer>
        </div>
      )}

      {view === 'dictionaries' && !selectedDictCode && (
        loading ? (
          <div className="status-state notice-state">
            <p>טוען את המילונים...</p>
          </div>
        ) : isDataLoaded() ? (
          <DictionaryList
            dictionaries={dictionaries}
            onSelectDictionary={handleSelectDictionary}
            getDictionaryHref={getDictionaryHref}
          />
        ) : (
          <div className="error error-state status-state">
            <p>כדי לעיין במילונים, יש לטעון נתונים בלשונית "העדפות".</p>
            <button className="secondary" onClick={() => setView('preferences')}>
              פתח העדפות
            </button>
          </div>
        )
      )}

      {view === 'dictionary' && selectedDictCode && selectedDictName && (
        loading ? (
          <div className="status-state notice-state">
            <p>טוען את המילון...</p>
          </div>
        ) : isDataLoaded() ? (
          <DictionaryBrowser
            dictionaryName={selectedDictName}
            dictionaryCode={selectedDictCode}
            useVowels={useVowels}
            selectedSubject={selectedSubject}
            selectedBucket={selectedBucket}
            onSelectSubject={handleSelectSubject}
            onSelectBucket={handleSelectBucket}
            getDictionaryHref={getDictionaryHref}
            getSubjectHref={getSubjectHref}
            getBucketHref={getBucketHref}
            allowAutoRedirect={navigationSourceRef.current !== 'pop'}
            debugMode={debugMode}
            onOpenDictionary={handleOpenDictionary}
            onOpenDictionarySubject={handleOpenDictionarySubject}
            onTermClick={handleTermClick}
            onSearchText={handleSearchText}
            getSearchHref={getSearchHref}
          />
        ) : (
          <div className="error error-state status-state">
            <p>כדי לפתוח מילון, יש לטעון נתונים בלשונית "העדפות".</p>
            <button className="secondary" onClick={() => setView('preferences')}>
              פתח העדפות
            </button>
          </div>
        )
      )}

      {view === 'preferences' && (
        <section className="preferences-panel" aria-label="העדפות מקור נתונים">
          <div className="preferences-header">
            <h2 className="hebrew-text">מקור נתונים</h2>
                <p className="preferences-hint">קובץ JSON המכיל את כל המילונים. (הקובץ נטען ונשמר ב-IndexDB בדפדפן). <a
                href="https://github.com/adielbm/hebrew-academy-terms/tree/main?tab=readme-ov-file"
                target="_blank"
                rel="noreferrer"
              >מידע נוסף</a>
            </p>
          </div>

          <div className="preferences-source-summary" aria-live="polite">
            <p className="preferences-source-summary-title">Browser DB status</p>
            <p>Status: {isDataLoaded() ? 'Loaded and searchable' : 'Not loaded yet'}</p>
            <p>Dictionaries in local DB: {dictionaries.length}</p>
            <p>Total terms in local DB: {totalTermsInDb}</p>
            <p>Saved loading mode: {activeDataSourceMode === 'local' ? 'Local file' : 'External URL download'}</p>
            {activeDataSourceMode === 'url' && activeDataSourceUrl ? <p dir="ltr">{activeDataSourceUrl}</p> : null}
            <p>Download progress: {loadProgress?.percentage !== null && loadProgress?.percentage !== undefined ? `${loadProgress.percentage}%` : '-'}</p>
            <p>Indexing progress: {indexingPercentage !== null ? `${indexingPercentage}%` : '-'}</p>
          </div>

          <div className="preferences-options" role="radiogroup" aria-label="בחירת מקור נתונים">
            <label className="preferences-option">
              <input
                type="radio"
                name="data-source-mode"
                checked={draftDataSourceMode === 'url'}
                onChange={() => setDraftDataSourceMode('url')}
              />
              <span>הורדה מכתובת URL חיצונית</span>
            </label>

            <label className="preferences-option">
              <input
                type="radio"
                name="data-source-mode"
                checked={draftDataSourceMode === 'local'}
                onChange={() => setDraftDataSourceMode('local')}
              />
              <span>טעינה מקובץ מקומי</span>
            </label>
          </div>

          <label className="preferences-option">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(event) => setDebugMode(event.target.checked)}
            />
            <span>Debug mode</span>
          </label>

          <p className="preferences-hint preferences-hint-ltr">
            כשמופעל, האפליקציה תדפיס ל-console מידע על ניווט, אזהרות ושגיאות.
          </p>

          {draftDataSourceMode === 'url' ? (
            <div className="preferences-field">
              <label htmlFor="data-source-url">כתובת קובץ נתונים (URL)</label>
              <input
                id="data-source-url"
                type="url"
                value={draftDataSourceUrl}
                onChange={(event) => setDraftDataSourceUrl(event.target.value)}
                disabled={draftDataSourceMode !== 'url'}
                dir="ltr"
                placeholder="https://example.com/data.json"
              />
              <p className="preferences-hint preferences-hint-ltr">יש להזין URL חיצוני מלא בלבד (כולל https://).</p>
            </div>
          ) : null}

          {draftDataSourceMode === 'local' ? (
            <div className="preferences-local-upload">
              <label className="local-data-upload-label" htmlFor="local-data-upload-input-preferences">
              </label>
              <input
                id="local-data-upload-input-preferences"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  void handleLocalDataUpload(event);
                }}
                disabled={isUploadingLocalData}
              />

              {isUploadingLocalData ? <p>טוען את הקובץ המקומי ומאחסן בדפדפן...</p> : null}
              {uploadError ? <p>{uploadError}</p> : null}

              {loadProgress ? (
                <div className="preferences-progress" aria-live="polite">
                  <p>
                    Download progress: {loadProgress.percentage !== null ? `${loadProgress.percentage}%` : '-'}
                  </p>
                  <p>
                    Indexing progress: {indexingPercentage !== null ? `${indexingPercentage}%` : '-'}
                  </p>
                  <p>
                    bytes: {formatBytes(loadProgress.loadedBytes)} / {formatBytes(loadProgress.totalBytes)}
                  </p>
                  <p>
                    remaining: {formatBytes(loadProgress.remainingBytes)}
                  </p>
                  <p>
                    parsed dictionaries: {loadProgress.parsedElements}
                  </p>
                  <p>
                    indexed terms: {loadProgress.indexedTerms}
                  </p>
                  <p>
                    state: {loadProgress.isComplete ? 'complete' : 'in-progress'}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="preferences-actions">
            <button className="secondary" onClick={handleSavePreferences}>
              שמירה וטעינה
            </button>
          </div>

          {preferencesLabel ? (
            <p className="preferences-label" aria-live="polite">
              {preferencesLabel}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
