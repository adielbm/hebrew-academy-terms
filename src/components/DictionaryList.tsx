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
        <div
          key={dict.dictionary_code}
          className="dictionary-card"
        >
          <div className="dictionary-card-content">
            <a
              className="dictionary-card-name"
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
              {dict.dictionary_name}
            </a>
            <span className="dictionary-card-count">{dict.terms_count}</span>
            {dict.year && <span className="dictionary-card-year">({dict.year})</span>}
          </div>
        </div>
      ))}
    </div>
  );
};
