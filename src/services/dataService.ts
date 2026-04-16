import { IndexedTerm, DictionaryMetadata } from '../types';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'https://hebrew-dict-api.adielbm.workers.dev';

type DictionaryApiItem = {
  name?: string;
  dictionary_name?: string;
  code?: string;
  dictionary_code?: string;
  terms_count?: number;
};

type SearchApiResponse = {
  results: Array<{
    id: string;
    hebrew_with_vowels: string;
    hebrew_without_vowels: string;
    english_translations?: string[];
    definition?: string;
    is_obsolete?: boolean;
    synonyms?: Array<{
      hebrew_with_vowels: string;
      hebrew_without_vowels: string;
    }>;
    dictionary_code: string;
  }>;
};

let dictionaryMetadata: DictionaryMetadata[] = [];

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function buildUrl(path: string): string {
  const base = API_BASE_URL.endsWith('/')
    ? API_BASE_URL.slice(0, -1)
    : API_BASE_URL;
  return `${base}${path}`;
}

function mapDictionaryItem(codeKey: string, item: DictionaryApiItem): DictionaryMetadata {
  return {
    dictionary_code: item.code || item.dictionary_code || codeKey,
    dictionary_name: item.name || item.dictionary_name || `מילון ${codeKey}`,
    terms_count: item.terms_count || 0,
  };
}

export async function loadAndIndexDictionaries(): Promise<void> {
  const dictionariesByCode = await fetchJson<Record<string, DictionaryApiItem>>(
    buildUrl('/dictionaries')
  );

  dictionaryMetadata = Object.entries(dictionariesByCode)
    .map(([code, item]) => mapDictionaryItem(code, item))
    .sort((a, b) =>
    a.dictionary_name.localeCompare(b.dictionary_name, 'he')
  );
}

export function getDictionaryMetadata(): DictionaryMetadata[] {
  return dictionaryMetadata;
}
export async function searchTerms(
  query: string,
  dictCode?: string,
  limit = 200
): Promise<IndexedTerm[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    q: normalizedQuery,
    limit: String(Math.min(Math.max(limit, 1), 200)),
  });

  if (dictCode) {
    params.set('dict', dictCode);
  }

  const data = await fetchJson<SearchApiResponse>(
    buildUrl(`/search?${params.toString()}`)
  );

  return data.results.map((term) => {
    const dictName =
      dictionaryMetadata.find((dict) => dict.dictionary_code === term.dictionary_code)
        ?.dictionary_name || `מילון ${term.dictionary_code}`;

    return {
      id: term.id,
      hebrew_with_vowels: term.hebrew_with_vowels,
      hebrew_without_vowels: term.hebrew_without_vowels,
      english_translations: term.english_translations || [],
      definition: term.definition || '',
      is_obsolete: Boolean(term.is_obsolete),
      synonyms: term.synonyms || [],
      dictionary_code: term.dictionary_code,
      dictionary_name: dictName,
    };
  });
}
