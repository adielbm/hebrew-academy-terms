import { FC } from 'react';
import { DictionaryMetadata } from '../types';

interface DictionaryListProps {
  dictionaries: DictionaryMetadata[];
  onSelectDictionary: (code: string) => void;
  getDictionaryHref: (code: string) => string;
}

export const DictionaryList: FC<DictionaryListProps> = ({
  dictionaries,
  onSelectDictionary,
  getDictionaryHref,
}) => {
  return (
    <div className="dictionary-list">
      {dictionaries.map((dict) => (
        <a
          key={dict.dictionary_code}
          className="dictionary-card"
          href={getDictionaryHref(dict.dictionary_code)}
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
            onSelectDictionary(dict.dictionary_code);
          }}
          aria-label={`פתח ${dict.dictionary_name}`}
        >
          <h3>{dict.dictionary_name}</h3>
          <p>{dict.terms_count} מונחים</p>
        </a>
      ))}
    </div>
  );
};
