import { FC, MouseEvent } from 'react';
import { IndexedTerm } from '../types';

interface TermItemProps {
  term: IndexedTerm;
  useVowels: boolean;
  onTermClick: (term: IndexedTerm) => void;
  onSearchText: (query: string) => void;
  getSearchHref: (query: string) => string;
}

export const TermItem: FC<TermItemProps> = ({
  term,
  useVowels,
  onTermClick,
  onSearchText,
  getSearchHref,
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
        <a
          className="term-link hebrew-text"
          href={getSearchHref(target)}
          onClick={(event) => handleSearchLinkClick(event, target)}
          aria-label={`חפש את המונח ${target}`}
        >
          {target}
        </a>
      </>
    );
  };

  const handleSearchLinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    query: string
  ) => {
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
    onSearchText(query);
  };

  const renderCommaSeparatedLinks = (
    items: Array<{
      text: string;
      href: string;
      ariaLabel: string;
      onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
    }>
  ) =>
    items.map((item, index) => (
      <span className="term-token" key={`${item.text}-${index}`}>
        <a
          className="term-link hebrew-text"
          href={item.href}
          onClick={item.onClick}
          aria-label={item.ariaLabel}
        >
          {item.text}
        </a>
        {index < items.length - 1 && <span aria-hidden="true">, </span>}
      </span>
    ));

  return (
    <div className={`result-item ${term.is_obsolete ? 'obsolete' : ''}`}>
      <div className="result-header">
        <div className="result-hebrew result-hebrew-inline">
          <span className="synonyms-inline hebrew-text">
            {renderCommaSeparatedLinks([
              {
                text: hebrew,
                href: getSearchHref(hebrew),
                ariaLabel: `חפש את המונח ${hebrew} בכל המילונים`,
                onClick: (event) => {
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
                  onTermClick(term);
                },
              },
              ...uniqueSynonyms.map((synonym) => ({
                text: synonym,
                href: getSearchHref(synonym),
                ariaLabel: `חפש את הנרדפת ${synonym}`,
                onClick: (event: MouseEvent<HTMLAnchorElement>) =>
                  handleSearchLinkClick(event, synonym),
              })),
            ])}
          </span>
        </div>
        {term.english_translations.length > 0 && (
          <div className="result-english-inline english-text">
            {term.english_translations.map((eng, index) => (
              <span className="term-token english-token" key={`${eng}-${index}`}>
                <a
                  className="term-link english-text"
                  href={getSearchHref(eng)}
                  onClick={(event) => handleSearchLinkClick(event, eng)}
                  aria-label={`חפש את המונח באנגלית ${eng}`}
                >
                  {eng}
                </a>
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

      <div className="result-footer">
        {term.is_obsolete && <span className="result-badge">מיושן</span>}
        <span className="result-badge dictionary">{term.dictionary_name}</span>
      </div>
    </div>
  );
};
