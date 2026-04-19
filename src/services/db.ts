import Dexie, { type Table } from 'dexie';
import type { DictionaryMetadata, IndexedTerm } from '../types';

export interface StoredTerm extends IndexedTerm {
  termKey: string;
}

export interface StoredDictionaryMetadata extends DictionaryMetadata {}

export interface StoredMeta {
  key: string;
  value: string;
}

class HebrewAcademyDb extends Dexie {
  terms!: Table<StoredTerm, string>;
  metadata!: Table<StoredDictionaryMetadata, string>;
  meta!: Table<StoredMeta, string>;

  constructor() {
    super('hebrew-academy-terms');

    this.version(1).stores({
      terms: '&termKey, dictionary_code',
      metadata: '&dictionary_code, dictionary_name',
      meta: '&key',
    });
  }
}

export const db = new HebrewAcademyDb();

export function buildTermKey(term: IndexedTerm): string {
  return `${term.dictionary_code}::${term.id}::${term.male}`;
}
