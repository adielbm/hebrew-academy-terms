import { buildTermKey, db, type StoredDictionaryMetadata, type StoredTerm } from './db';
import type {
  DictionaryCollection,
  DictionaryEntry,
  DictionaryMetadata,
  HebrewTerm,
  IndexedTerm,
  TermEntry,
  TranslationEntry,
} from '../types';

export interface LoadProgress {
  loadedBytes: number;
  totalBytes: number | null;
  remainingBytes: number | null;
  percentage: number | null;
  parsedElements: number;
  indexedTerms: number;
  isComplete: boolean;
}

export interface LoadOptions {
  onProgress?: (progress: LoadProgress) => void;
}

export interface DictionaryContextMatch {
  dictionary_code: string;
  dictionary_name: string;
  subjects: string[];
  matchedByName: boolean;
}

type ParserWorkerMessage =
  | { type: 'element'; element: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string };

const DATA_FILE_URL = `${import.meta.env.BASE_URL}data.json`;
const SEARCH_LIMIT = 200;
const LOAD_COMPLETE_META_KEY = 'loadComplete';
const SEARCH_INDEX_VERSION_META_KEY = 'searchIndexVersion';
const SEARCH_INDEX_VERSION = '2';

let loadPromise: Promise<void> | null = null;
let dictionaryMetadata: DictionaryMetadata[] = [];
let allTerms: IndexedTerm[] = [];
let isLoaded = false;
let currentLoadProgress: LoadProgress | null = null;

let loadedBytes = 0;
let totalBytes: number | null = null;
let parsedElements = 0;

const progressListeners = new Set<(progress: LoadProgress) => void>();
const indexListeners = new Set<() => void>();

function emitLoadProgress(progress: LoadProgress): void {
  currentLoadProgress = progress;
  for (const listener of progressListeners) {
    listener(progress);
  }
}

function emitIndexUpdated(): void {
  for (const listener of indexListeners) {
    listener();
  }
}

export function subscribeIndexUpdates(listener: () => void): () => void {
  indexListeners.add(listener);
  return () => {
    indexListeners.delete(listener);
  };
}

function createLoadProgress(isComplete: boolean): LoadProgress {
  const percentage = totalBytes && totalBytes > 0
    ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
    : null;

  return {
    loadedBytes,
    totalBytes,
    remainingBytes: totalBytes !== null ? Math.max(totalBytes - loadedBytes, 0) : null,
    percentage,
    parsedElements,
    indexedTerms: allTerms.length,
    isComplete,
  };
}

function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenizeForWholeWordMatch(text: string): string[] {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function matchesWholeWords(searchText: string, query: string): boolean {
  const queryTokens = tokenizeForWholeWordMatch(query);
  if (queryTokens.length === 0) {
    return false;
  }

  const textTokens = new Set(tokenizeForWholeWordMatch(searchText));
  return queryTokens.every((token) => textTokens.has(token));
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
}

function uniqueHebrewTerms(terms: HebrewTerm[]): HebrewTerm[] {
  const seen = new Set<string>();
  const unique: HebrewTerm[] = [];

  for (const term of terms) {
    const key = `${term.haser}|||${term.male}|||${term.source ?? ''}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(term);
  }

  return unique;
}

function flattenHebrewTerms(entry: TermEntry): HebrewTerm[] {
  const terms: HebrewTerm[] = [];

  for (const variant of entry.he ?? []) {
    terms.push(...variant.terms);
  }

  return uniqueHebrewTerms(terms);
}

function collectSearchableValues(value: unknown, values: string[]): void {
  if (value == null) {
    return;
  }

  if (typeof value === 'string') {
    const normalized = normalizeText(value);
    if (normalized) {
      values.push(normalized);
    }

    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    values.push(normalizeText(String(value)));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSearchableValues(item, values);
    }

    return;
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectSearchableValues(item, values);
    }
  }
}

function buildSearchText(term: IndexedTerm): string {
  const values: string[] = [];
  collectSearchableValues(
    {
      dictionary_code: term.dictionary_code,
      dictionary_terms_count: term.dictionary_terms_count,
      dictionary_year: term.dictionary_year,
      haser: term.haser,
      male: term.male,
      en: term.en,
      definition: term.definition,
      synonyms: term.synonyms,
      remarks: term.remarks,
      la: term.la,
      is_obsolete: term.is_obsolete,
    },
    values
  );

  return Array.from(new Set(values)).join(' ');
}

function normalizeTranslations(entries: TranslationEntry[] | undefined): string[] {
  return uniqueStrings((entries ?? []).map((translation) => translation.term));
}

function normalizeTerm(dictionary: DictionaryEntry, entry: TermEntry): IndexedTerm | null {
  const hebrewTerms = flattenHebrewTerms(entry);
  const primary = hebrewTerms[0];

  if (!primary) {
    return null;
  }

  const synonyms = hebrewTerms.slice(1);
  const englishTerms = normalizeTranslations(entry.en);
  const latinTerms = normalizeTranslations(entry.la);
  const definition = (entry.he ?? [])
    .map((variant) => variant.def?.trim())
    .find((value): value is string => Boolean(value));

  const indexedTerm: IndexedTerm = {
    id: entry.id,
    dictionary_name: dictionary.dictionary_name,
    dictionary_code: dictionary.dictionary_code,
    dictionary_terms_count: dictionary.terms_count,
    dictionary_year: dictionary.year,
    haser: primary.haser,
    male: primary.male,
    en: englishTerms,
    definition: definition ?? '',
    synonyms,
    raw: entry,
    searchText: '',
    subject: entry.subject,
    remarks: entry.remarks?.filter((remark) => remark.trim().length > 0),
    la: latinTerms,
    is_obsolete: Boolean(entry.is_obsolete),
  };

  return {
    ...indexedTerm,
    searchText: buildSearchText(indexedTerm),
  };
}

function sortMetadata(items: DictionaryMetadata[]): DictionaryMetadata[] {
  return [...items].sort((left, right) => left.dictionary_name.localeCompare(right.dictionary_name, 'he'));
}

async function clearPersistence(): Promise<void> {
  await db.transaction('rw', db.terms, db.metadata, db.meta, async () => {
    await db.terms.clear();
    await db.metadata.clear();
    await db.meta.put({ key: LOAD_COMPLETE_META_KEY, value: 'false' });
    await db.meta.put({ key: SEARCH_INDEX_VERSION_META_KEY, value: SEARCH_INDEX_VERSION });
  });
}

function stripStoredTerm(term: StoredTerm): IndexedTerm {
  const { termKey: _termKey, ...record } = term;
  return record;
}

async function hydrateFromPersistence(): Promise<boolean> {
  try {
    const [meta, indexVersionMeta, storedTerms, storedMetadata] = await Promise.all([
      db.meta.get(LOAD_COMPLETE_META_KEY),
      db.meta.get(SEARCH_INDEX_VERSION_META_KEY),
      db.terms.toArray(),
      db.metadata.toArray(),
    ]);

    if (
      meta?.value !== 'true' ||
      indexVersionMeta?.value !== SEARCH_INDEX_VERSION ||
      storedTerms.length === 0
    ) {
      return false;
    }

    allTerms = storedTerms.map(stripStoredTerm);
    dictionaryMetadata = sortMetadata(storedMetadata);
    parsedElements = dictionaryMetadata.length;
    loadedBytes = 0;
    totalBytes = null;
    isLoaded = true;

    emitLoadProgress({
      loadedBytes: 0,
      totalBytes: null,
      remainingBytes: null,
      percentage: 100,
      parsedElements,
      indexedTerms: allTerms.length,
      isComplete: true,
    });

    emitIndexUpdated();
    return true;
  } catch {
    return false;
  }
}

function isDictionaryEntry(value: unknown): value is DictionaryEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<DictionaryEntry>;
  return (
    typeof candidate.dictionary_code === 'string' &&
    typeof candidate.dictionary_name === 'string' &&
    Array.isArray(candidate.terms)
  );
}

async function persistDictionary(dictionary: DictionaryEntry): Promise<void> {
  const terms = dictionary.terms
    .map((entry) => normalizeTerm(dictionary, entry))
    .filter((term): term is IndexedTerm => Boolean(term));

  const metadataRecord: StoredDictionaryMetadata = {
    dictionary_name: dictionary.dictionary_name,
    dictionary_code: dictionary.dictionary_code,
    terms_count: dictionary.terms_count,
    year: dictionary.year,
  };

  const termRecords: StoredTerm[] = terms.map((term) => ({
    ...term,
    termKey: buildTermKey(term),
  }));

  await db.transaction('rw', db.terms, db.metadata, async () => {
    await db.metadata.put(metadataRecord);
    if (termRecords.length > 0) {
      await db.terms.bulkPut(termRecords);
    }
  });

  dictionaryMetadata = sortMetadata([...dictionaryMetadata.filter((item) => item.dictionary_code !== dictionary.dictionary_code), metadataRecord]);
  allTerms.push(...terms);
  parsedElements += 1;

  emitLoadProgress(createLoadProgress(false));
  emitIndexUpdated();
}

async function processCollectionFallback(collection: DictionaryCollection): Promise<void> {
  for (const dictionary of collection) {
    await persistDictionary(dictionary);
  }
}

async function processWithWorker(response: Response): Promise<void> {
  if (!response.body) {
    const collection = (await response.json()) as DictionaryCollection;
    await processCollectionFallback(collection);
    return;
  }

  const worker = new Worker(new URL('../workers/jsonArrayParser.worker.ts', import.meta.url), { type: 'module' });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let donePromiseResolve: (() => void) | null = null;
  let donePromiseReject: ((error: Error) => void) | null = null;
  const donePromise = new Promise<void>((resolve, reject) => {
    donePromiseResolve = resolve;
    donePromiseReject = reject;
  });

  let parserCompleted = false;
  let processing = Promise.resolve();

  worker.onmessage = (event: MessageEvent<ParserWorkerMessage>) => {
    const message = event.data;

    if (message.type === 'element') {
      processing = processing
        .then(async () => {
          if (!isDictionaryEntry(message.element)) {
            return;
          }

          await persistDictionary(message.element);
        })
        .catch((error) => {
          if (donePromiseReject) {
            donePromiseReject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      return;
    }

    if (message.type === 'done') {
      if (!parserCompleted && donePromiseResolve) {
        parserCompleted = true;
        donePromiseResolve();
      }
      return;
    }

    if (message.type === 'error' && donePromiseReject) {
      donePromiseReject(new Error(message.message));
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      loadedBytes += value.byteLength;
      const chunk = decoder.decode(value, { stream: true });
      emitLoadProgress(createLoadProgress(false));
      worker.postMessage({ type: 'chunk', chunk, final: false });
    }

    const finalChunk = decoder.decode();
    worker.postMessage({ type: 'chunk', chunk: finalChunk, final: true });

    await donePromise;
    await processing;
  } finally {
    worker.terminate();
  }
}

async function loadDictionaries(options: LoadOptions = {}): Promise<void> {
  if (options.onProgress) {
    progressListeners.add(options.onProgress);
    if (currentLoadProgress) {
      options.onProgress(currentLoadProgress);
    }
  }

  try {
    if (await hydrateFromPersistence()) {
      return;
    }

    allTerms = [];
    dictionaryMetadata = [];
    isLoaded = false;
    parsedElements = 0;
    loadedBytes = 0;
    totalBytes = null;

    await clearPersistence();

    const response = await fetch(DATA_FILE_URL);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `HTTP ${response.status}`);
    }

    const totalBytesHeader = response.headers.get('content-length');
    totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
    emitLoadProgress(createLoadProgress(false));

    await processWithWorker(response);

    isLoaded = true;
    await db.transaction('rw', db.meta, async () => {
      await db.meta.put({ key: LOAD_COMPLETE_META_KEY, value: 'true' });
      await db.meta.put({ key: SEARCH_INDEX_VERSION_META_KEY, value: SEARCH_INDEX_VERSION });
    });
    emitLoadProgress(createLoadProgress(true));
  } finally {
    if (options.onProgress) {
      progressListeners.delete(options.onProgress);
    }
  }
}

export async function loadAndIndexDictionaries(options: LoadOptions = {}): Promise<void> {
  if (options.onProgress) {
    progressListeners.add(options.onProgress);
    if (currentLoadProgress) {
      options.onProgress(currentLoadProgress);
    }
  }

  if (isLoaded) {
    if (options.onProgress && currentLoadProgress) {
      options.onProgress(currentLoadProgress);
    }

    if (options.onProgress) {
      progressListeners.delete(options.onProgress);
    }

    return Promise.resolve();
  }

  if (!loadPromise) {
    loadPromise = loadDictionaries().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }

  try {
    await loadPromise;
  } finally {
    if (options.onProgress) {
      progressListeners.delete(options.onProgress);
    }
  }
}

export function getDictionaryMetadata(): DictionaryMetadata[] {
  return dictionaryMetadata;
}

export function isDataLoaded(): boolean {
  return isLoaded;
}

export function getLoadProgress(): LoadProgress | null {
  return currentLoadProgress;
}

export async function searchTerms(
  query: string,
  dictionaryCode?: string,
  limit = SEARCH_LIMIT
): Promise<IndexedTerm[]> {
  if (!isLoaded && !loadPromise) {
    void loadAndIndexDictionaries();
  }

  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < 2) {
    return [];
  }

  const targetRecords = dictionaryCode
    ? allTerms.filter((term) => term.dictionary_code === dictionaryCode)
    : allTerms;

  return targetRecords
    .filter((term) => matchesWholeWords(term.searchText, normalizedQuery))
    .slice(0, Math.max(1, Math.min(limit, SEARCH_LIMIT)));
}

function normalizeSubject(value: string | undefined): string {
  return value?.trim() ?? '';
}

export async function getDictionaryContextMatches(
  query: string,
  limit = 40
): Promise<DictionaryContextMatch[]> {
  if (!isLoaded && !loadPromise) {
    void loadAndIndexDictionaries();
  }

  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < 2) {
    return [];
  }

  const subjectsByDictionary = new Map<string, Set<string>>();
  for (const term of allTerms) {
    const subject = normalizeSubject(term.subject);
    if (!subject) {
      continue;
    }

    const existing = subjectsByDictionary.get(term.dictionary_code) ?? new Set<string>();
    existing.add(subject);
    subjectsByDictionary.set(term.dictionary_code, existing);
  }

  const matches: DictionaryContextMatch[] = [];
  for (const dictionary of dictionaryMetadata) {
    const matchedByName = normalizeText(dictionary.dictionary_name).includes(normalizedQuery);
    const matchingSubjects = Array.from(subjectsByDictionary.get(dictionary.dictionary_code) ?? [])
      .filter((subject) => normalizeText(subject).includes(normalizedQuery))
      .sort((left, right) => left.localeCompare(right, 'he'));

    if (!matchedByName && matchingSubjects.length === 0) {
      continue;
    }

    matches.push({
      dictionary_code: dictionary.dictionary_code,
      dictionary_name: dictionary.dictionary_name,
      subjects: matchingSubjects,
      matchedByName,
    });
  }

  return matches
    .sort((left, right) => left.dictionary_name.localeCompare(right.dictionary_name, 'he'))
    .slice(0, Math.max(1, limit));
}

export async function getDictionarySubjects(dictionaryCode: string): Promise<string[]> {
  if (!isLoaded && !loadPromise) {
    void loadAndIndexDictionaries();
  }

  return Array.from(
    new Set(
      allTerms
        .filter((term) => term.dictionary_code === dictionaryCode)
        .map((term) => normalizeSubject(term.subject))
        .filter((subject) => subject.length > 0)
    )
  ).sort((left, right) => left.localeCompare(right, 'he'));
}

export async function getDictionaryTermsBySubject(
  dictionaryCode: string,
  subject: string
): Promise<IndexedTerm[]> {
  if (!isLoaded && !loadPromise) {
    void loadAndIndexDictionaries();
  }

  const normalizedSubject = normalizeSubject(subject);
  return allTerms
    .filter(
      (term) =>
        term.dictionary_code === dictionaryCode &&
        normalizeSubject(term.subject) === normalizedSubject
    )
    .sort((left, right) => left.male.localeCompare(right.male, 'he'));
}
