import { FC } from 'react';
import { IndexedTerm } from '../types';

interface TermItemProps {
  term: IndexedTerm;
  useVowels: boolean;
  onTermClick: (term: IndexedTerm) => void;
  onSearchText: (query: string) => void;
}

export const TermItem: FC<TermItemProps> = ({
  term,
  useVowels,
  onTermClick,
  onSearchText,
}) => {
  const hebrew = useVowels ? term.hebrew_with_vowels : term.hebrew_without_vowels;
  const uniqueSynonyms = Array.from(
    new Set(
      term.synonyms
        .map((synonym) =>
          useVowels ? synonym.hebrew_with_vowels : synonym.hebrew_without_vowels
        )
        .filter((value) => value.trim().length > 0)
    )
  );

  const renderDefinition = () => {
    const trimmed = term.definition.trim();
    const referenceMatch = trimmed.match(/^((?:ר['׳]?)\s*:\s*)(.+)$/);

    if (!referenceMatch) {
      return trimmed;
    }

    const prefix = referenceMatch[1];
    const target = referenceMatch[2].trim();

    if (!target) {
      return trimmed;
    }

    return (
      <>
        <span>{prefix}</span>
        <button
          type="button"
          className="term-link hebrew-text"
          onClick={() => onSearchText(target)}
          aria-label={`חפש את המונח ${target}`}
        >
          {target}
        </button>
      </>
    );
  };

  return (
    <div className={`result-item ${term.is_obsolete ? 'obsolete' : ''}`}>
      <div className="result-header">
        <div className="result-hebrew">
          <button
            type="button"
            className="term-link hebrew-text"
            onClick={() => onTermClick(term)}
            aria-label={`חפש את המונח ${hebrew} בכל המילונים`}
          >
            {hebrew}
          </button>
        </div>
        {term.english_translations.length > 0 && (
          <div className="result-english-inline english-text">
            {term.english_translations.map((eng, index) => (
              <span key={`${eng}-${index}`}>
                <button
                  type="button"
                  className="term-link english-text"
                  onClick={() => onSearchText(eng)}
                  aria-label={`חפש את המונח באנגלית ${eng}`}
                >
                  {eng}
                </button>
                {index < term.english_translations.length - 1 && (
                  <span aria-hidden="true">, </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {term.definition && (
        <div className="result-definition hebrew-definition">
          {renderDefinition()}
        </div>
      )}

      {uniqueSynonyms.length > 0 && (
        <div className="synonyms-row">
          <span className="synonyms-label">נרדפות:</span>
          <div className="synonyms-list">
            {uniqueSynonyms.map((synonym, index) => (
              <span key={`${synonym}-${index}`}>
                <button
                  type="button"
                  className="term-link hebrew-text"
                  onClick={() => onSearchText(synonym)}
                  aria-label={`חפש את הנרדפת ${synonym}`}
                >
                  {synonym}
                </button>
                {index < uniqueSynonyms.length - 1 && (
                  <span aria-hidden="true">, </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="result-footer">
        {term.is_obsolete && (
          <span className="result-badge">מיושן</span>
        )}
        <span className="result-badge dictionary">{term.dictionary_name}</span>
      </div>
    </div>
  );
};
