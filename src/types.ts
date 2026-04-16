export interface Term {
  id: string;
  hebrew_with_vowels: string;
  hebrew_without_vowels: string;
  english_translations: string[];
  definition: string;
  is_obsolete: boolean;
  synonyms: Array<{
    hebrew_with_vowels: string;
    hebrew_without_vowels: string;
  }>;
}

export interface Dictionary {
  dictionary_name: string;
  dictionary_code: string;
  year: string;
  terms_count: number;
  terms: Term[];
}

export interface IndexedTerm extends Term {
  dictionary_code: string;
  dictionary_name: string;
}

export interface DictionaryMetadata {
  dictionary_code: string;
  dictionary_name: string;
  terms_count: number;
}
