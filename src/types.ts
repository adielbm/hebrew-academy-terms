export type DictionaryCollection = DictionaryEntry[];

export interface DictionaryMetadata {
  dictionary_name: string;
  dictionary_code: string;
  terms_count: number;

  // Optional in the source data, but not always present.
  year?: string;
}

export interface IndexedTerm {
  id: string;
  dictionary_name: string;
  dictionary_code: string;
  dictionary_terms_count: number;

  // Optional in the source data, but useful for display and sorting.
  dictionary_year?: string;

  // Primary Hebrew spelling with niqqud.
  haser: string;

  // Primary Hebrew spelling without niqqud.
  male: string;

  // English translations as plain strings.
  en: string[];

  // Canonical definition from the Hebrew entry.
  definition: string;

  // Additional Hebrew spellings from the same dictionary entry.
  synonyms: HebrewTerm[];

  // Original raw term object from public/data.json.
  raw: TermEntry;

  // Normalized searchable text built from every field in the record.
  searchText: string;

  subject?: string;
  remarks?: string[];
  la?: string[];
  is_obsolete?: boolean;
}

export interface DictionaryEntry {
  dictionary_name: string;
  dictionary_code: string;
  terms_count: number;
  terms: TermEntry[];

  year?: string;
}

export interface TermEntry {
  id: string;

  // Hebrew variants.
  he?: HebrewVariant[];

  // English translations.
  en?: TranslationEntry[];

  // Latin names.
  la?: TranslationEntry[];

  remarks?: string[];
  mesumman?: MesummanEntry[];
  subject?: string;

  // Kept optional because output pruning removes false/empty values.
  is_obsolete?: boolean;

  [key: string]: unknown;
}

export interface HebrewVariant {
  terms: HebrewTerm[];
  def?: string;
}

export interface HebrewTerm {
  // With niqqud.
  haser: string;

  // Without niqqud.
  male: string;

  // Original/source form (when available).
  source?: string;
}

export interface TranslationEntry {
  term: string;
  def?: string;
  source?: string;
}

export interface MesummanEntry {
  kod: string;
  additional_terms?: string[];
}

