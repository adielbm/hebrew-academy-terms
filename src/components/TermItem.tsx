import { FC, MouseEvent } from 'react';
import { IndexedTerm } from '../types';

interface TermItemProps {
  term: IndexedTerm;
  useVowels: boolean;
  onTermClick: (term: IndexedTerm) => void;
  onSearchText: (query: string) => void;
  getSearchHref: (query: string) => string;
  getDictionaryHref?: (code: string) => string;
  getSubjectHref?: (subject: string) => string;
  onOpenDictionary?: (code: string) => void;
  onOpenDictionarySubject?: (code: string, subject: string) => void;
}

export const TermItem: FC<TermItemProps> = ({
  term,
  useVowels,
  onTermClick,
  onSearchText,
  getSearchHref,
  getDictionaryHref,
  getSubjectHref,
  onOpenDictionary,
  onOpenDictionarySubject,
}) => {
  const hebrew = useVowels ? term.haser : term.male;
  const hebrewVariants = term.raw.he ?? [];
  const englishEntries = term.raw.en ?? [];
  const latinEntries = term.raw.la ?? [];
  const hasRemarks = Boolean(term.remarks && term.remarks.length > 0);

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

  const handleNavigationLinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    callback: () => void
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
    callback();
  };

  const renderCommaSeparatedLinks = (
    items: Array<{
      text: string;
      href: string;
      ariaLabel: string;
      className?: string;
      onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
    }>,
    separator = ', '
  ) =>
    items.map((item, index) => (
      <span className="term-token" key={`${item.text}-${index}`}>
        <a
          className={`term-link ${item.className ?? ''}`.trim()}
          href={item.href}
          onClick={item.onClick}
          aria-label={item.ariaLabel}
        >
          {item.text}
        </a>
        {index < items.length - 1 && (
          <span className="term-separator" aria-hidden="true">{separator}</span>
        )}
      </span>
    ));

  const renderCommaSeparatedText = (items: string[], className?: string) => (
    <span className={className}>
      {items.map((item, index) => (
        <span className="term-token" key={`${item}-${index}`}>
          <span>{item}</span>
          {index < items.length - 1 && <span aria-hidden="true">, </span>}
        </span>
      ))}
    </span>
  );

  const collectSources = (sources: Array<string | undefined>): string[] =>
    Array.from(
      new Set(
        sources
          .map((source) => source?.trim())
          .filter((source): source is string => Boolean(source))
      )
    );

  const renderSource = (sources: string[]) => {
    if (sources.length === 0) {
      return null;
    }

    return (
      <span className="term-row-source">
        <span className="term-row-source-paren" aria-hidden="true">(</span>
        <span className="term-row-source-label">במקור </span>
        {sources.map((source, index) => (
          <span className="term-token" key={`${source}-${index}`}>
            <a
              className="term-row-source-link"
              href={getSearchHref(source)}
              onClick={(event) => handleSearchLinkClick(event, source)}
              aria-label={`חפש את המקור ${source}`}
            >
              {source}
            </a>
            {index < sources.length - 1 && <span aria-hidden="true">, </span>}
          </span>
        ))}
        <span className="term-row-source-paren" aria-hidden="true">)</span>
      </span>
    );
  };

  const isShortDef = (definition?: string) => {
    if (!definition) {
      return false;
    }

    return definition.trim().length < 15;
  };

  return (
    <div className={`result-item ${term.is_obsolete ? 'obsolete' : ''}`}>
      {hebrewVariants.length > 0 && (
        <div className="term-rows term-rows-hebrew">
          {hebrewVariants.map((variant, variantIndex) => {
            const termRows = Array.from(
              new Map(
                variant.terms
                  .map((variantTerm) => {
                    const text = useVowels ? variantTerm.haser : variantTerm.male;
                    const source = variantTerm.source?.trim();

                    return {
                      text: text.trim(),
                      source: source && source.length > 0 ? source : undefined,
                    };
                  })
                  .filter((row) => row.text.length > 0)
                  .map((row) => [`${row.text}|||${row.source ?? ''}`, row])
              ).values()
            );

            if (termRows.length === 0) {
              return null;
            }

            return (
              <div key={`he-${variantIndex}`}>
                {termRows.map((row, rowIndex) => (
                  <div
                    className={`term-row ${rowIndex === 0 && isShortDef(variant.def) ? 'term-row-single-line' : ''}`.trim()}
                    key={`he-${variantIndex}-${row.text}-${row.source ?? rowIndex}`}
                  >
                    <span className="term-row-main hebrew-text">
                      <a
                        className="term-link hebrew-text"
                        href={getSearchHref(row.text)}
                        aria-label={`חפש את המונח ${row.text}`}
                        onClick={(event) => {
                          if (row.text === hebrew) {
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
                            return;
                          }

                          handleSearchLinkClick(event, row.text);
                        }}
                      >
                        {row.text}
                      </a>
                    </span>
                    {rowIndex === 0 && variant.def && (
                      <div className="term-row-def hebrew-definition">{variant.def}</div>
                    )}
                    {renderSource(row.source ? [row.source] : [])}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {englishEntries.length > 0 && (
        <div className="term-rows term-rows-english">
          {englishEntries
            .filter((entry) => entry.term.trim().length > 0)
            .map((entry, index) => (
              <div
                className={`term-row term-row-ltr ${isShortDef(entry.def) ? 'term-row-single-line' : ''}`.trim()}
                key={`en-${entry.term}-${index}`}
              >
                <div className="term-row-main english-text">
                  <a
                    className="term-link english-text"
                    href={getSearchHref(entry.term)}
                    onClick={(event) => handleSearchLinkClick(event, entry.term)}
                    aria-label={`חפש את המונח באנגלית ${entry.term}`}
                  >
                    {entry.term}
                  </a>
                </div>
                {entry.def && <div className="term-row-def">{entry.def}</div>}
                {renderSource(collectSources([entry.source]))}
              </div>
            ))}
        </div>
      )}

      {term.definition && !hebrewVariants.some((variant) => Boolean(variant.def?.trim())) && (
        <div className="result-definition hebrew-definition">
          {renderDefinition()}
        </div>
      )}

      {latinEntries.length > 0 && (
        <div className="term-rows term-rows-latin">
          {latinEntries
            .filter((entry) => entry.term.trim().length > 0)
            .map((entry, index) => (
              <div
                className={`term-row term-row-ltr ${isShortDef(entry.def) ? 'term-row-single-line' : ''}`.trim()}
                key={`la-${entry.term}-${index}`}
              >
                <div className="term-row-main latin-text">
                  <a
                    className="term-link latin-text"
                    href={getSearchHref(entry.term)}
                    onClick={(event) => handleSearchLinkClick(event, entry.term)}
                    aria-label={`חפש את המונח בלטינית ${entry.term}`}
                  >
                    {entry.term}
                  </a>
                </div>
                {entry.def && <div className="term-row-def">{entry.def}</div>}
                {renderSource(collectSources([entry.source]))}
              </div>
            ))}
        </div>
      )}

      {latinEntries.length === 0 && (term.la ?? []).length > 0 && (
        <div className="term-meta-grid">
          <div className="term-meta-row">
            <span className="term-meta-label">לטינית</span>
            <span className="term-meta-value latin-text">
              {renderCommaSeparatedLinks(
                (term.la ?? []).map((latin) => ({
                  text: latin,
                  href: getSearchHref(latin),
                  ariaLabel: `חפש את המונח בלטינית ${latin}`,
                  className: 'latin-text',
                  onClick: (event: MouseEvent<HTMLAnchorElement>) =>
                    handleSearchLinkClick(event, latin),
                }))
              )}
            </span>
          </div>
        </div>
      )}

      {hasRemarks && (
        <div className="term-meta-grid">
          <div className="term-meta-row term-meta-row-no-label">
            <span className="term-meta-value">{renderCommaSeparatedText(term.remarks ?? [], 'remark-list')}</span>
          </div>
        </div>
      )}

      <div className="result-footer">
        {term.is_obsolete && <span>מיושן</span>}
        {term.dictionary_year && (
          <span>{term.dictionary_year}</span>
        )}
        {getDictionaryHref ? (
          <a
            className="dictionary-name term-link"
            href={getDictionaryHref(term.dictionary_code)}
            onClick={(event) =>
              onOpenDictionary
                ? handleNavigationLinkClick(event, () => {
                    onOpenDictionary(term.dictionary_code);
                  })
                : undefined
            }
          >
            {term.dictionary_name}
          </a>
        ) : (
          <span className="dictionary-name">{term.dictionary_name}</span>
        )}
        <span>, </span>
        {term.subject &&
          (getSubjectHref ? (
            <a
              className="dictionary-subject term-link"
              href={getSubjectHref(term.subject)}
              onClick={(event) =>
                onOpenDictionarySubject
                  ? handleNavigationLinkClick(event, () => {
                      onOpenDictionarySubject(term.dictionary_code, term.subject as string);
                    })
                  : undefined
              }
            >
              {term.subject}
            </a>
          ) : (
            <span className="dictionary-subject">{term.subject}</span>
          ))}
      </div>
    </div>
  );
};
