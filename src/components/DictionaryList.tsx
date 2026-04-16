import { FC } from 'react';
import { DictionaryMetadata } from '../types';

interface DictionaryListProps {
  dictionaries: DictionaryMetadata[];
  onSelectDictionary: (code: string) => void;
}

export const DictionaryList: FC<DictionaryListProps> = ({
  dictionaries,
  onSelectDictionary,
}) => {
  return (
    <div className="dictionary-list">
      {dictionaries.map((dict) => (
        <button
          key={dict.dictionary_code}
          className="dictionary-card"
          onClick={() => onSelectDictionary(dict.dictionary_code)}
          aria-label={`פתח ${dict.dictionary_name}`}
        >
          <h3>{dict.dictionary_name}</h3>
          <p>{dict.terms_count} מונחים</p>
        </button>
      ))}
    </div>
  );
};
