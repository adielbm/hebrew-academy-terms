import { FC, MouseEvent, useEffect, useMemo, useState } from 'react';
import type { IndexedTerm } from '../types';
import { TermItem } from './TermItem';
import {
  getDictionarySubjects,
  getDictionaryTermsBySubject,
  subscribeIndexUpdates,
} from '../services/dataService';

const SUBJECT_TERM_CHUNK_THRESHOLD = 200;

interface DictionaryBrowserProps {
  dictionaryName: string;
  dictionaryCode: string;
  useVowels: boolean;
  selectedSubject: string | null;
  selectedBucket: string | null;
  onSelectSubject: (subject: string | null, replaceHistory?: boolean) => void;
  onSelectBucket: (bucket: string | null, replaceHistory?: boolean) => void;
  getDictionaryHref: (code: string) => string;
  getSubjectHref: (subject: string) => string;
  getBucketHref: (bucket: string) => string;
  allowAutoRedirect: boolean;
  debugMode: boolean;
  onOpenDictionary: (code: string) => void;
  onOpenDictionarySubject: (code: string, subject: string) => void;
  onTermClick: (term: IndexedTerm) => void;
  onSearchText: (query: string) => void;
  getSearchHref: (query: string) => string;
}

function getLeadingBucket(term: IndexedTerm): string {
  const value = term.male.trim();
  if (!value) {
    return '#';
  }

  return value[0];
}

function getBuckets(terms: IndexedTerm[]): string[] {
  return Array.from(new Set(terms.map((term) => getLeadingBucket(term)))).sort((left, right) =>
    left.localeCompare(right, 'he')
  );
}

export const DictionaryBrowser: FC<DictionaryBrowserProps> = ({
  dictionaryName,
  dictionaryCode,
  useVowels,
  selectedSubject,
  selectedBucket,
  onSelectSubject,
  onSelectBucket,
  getDictionaryHref,
  getSubjectHref,
  getBucketHref,
  allowAutoRedirect,
  debugMode,
  onOpenDictionary,
  onOpenDictionarySubject,
  onTermClick,
  onSearchText,
  getSearchHref,
}) => {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectTerms, setSubjectTerms] = useState<IndexedTerm[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadSubjects = async () => {
      const nextSubjects = await getDictionarySubjects(dictionaryCode);
      if (!cancelled) {
        setSubjects(nextSubjects);
        // Auto-select the only subject if there's exactly one
        if (allowAutoRedirect && nextSubjects.length === 1 && !selectedSubject) {
          if (debugMode) {
            console.info('[dictionary] auto-selected only subject', {
              dictionaryCode,
              subject: nextSubjects[0],
            });
          }
          onSelectSubject(nextSubjects[0], true);
        } else if (debugMode && nextSubjects.length === 1 && !selectedSubject) {
          console.info('[dictionary] skipped auto subject redirect during history restore', {
            dictionaryCode,
            subject: nextSubjects[0],
          });
        }
      }
    };

    void loadSubjects();

    const unsubscribe = subscribeIndexUpdates(() => {
      void loadSubjects();
      if (selectedSubject) {
        void getDictionaryTermsBySubject(dictionaryCode, selectedSubject).then((terms) => {
          if (!cancelled) {
            setSubjectTerms(terms);
          }
        });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [allowAutoRedirect, debugMode, dictionaryCode, selectedSubject, onSelectSubject]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedSubject) {
      setSubjectTerms([]);
      return;
    }

    void getDictionaryTermsBySubject(dictionaryCode, selectedSubject).then((terms) => {
      if (!cancelled) {
        setSubjectTerms(terms);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dictionaryCode, selectedSubject]);

  const buckets = useMemo(() => getBuckets(subjectTerms), [subjectTerms]);

  useEffect(() => {
    if (!allowAutoRedirect) {
      return;
    }

    if (subjectTerms.length <= SUBJECT_TERM_CHUNK_THRESHOLD) {
      if (selectedBucket !== null) {
        onSelectBucket(null, true);
      }
      return;
    }

    if (selectedBucket && buckets.includes(selectedBucket)) {
      return;
    }

    if (debugMode && buckets[0]) {
      console.info('[dictionary] auto-selected bucket', {
        dictionaryCode,
        subject: selectedSubject,
        bucket: buckets[0],
      });
    }
    onSelectBucket(buckets[0] ?? null, true);
  }, [allowAutoRedirect, buckets, debugMode, dictionaryCode, onSelectBucket, selectedBucket, selectedSubject, subjectTerms.length]);

  const displayedTerms = useMemo(() => {
    if (subjectTerms.length <= SUBJECT_TERM_CHUNK_THRESHOLD || !selectedBucket) {
      return subjectTerms;
    }

    return subjectTerms.filter((term) => getLeadingBucket(term) === selectedBucket);
  }, [selectedBucket, subjectTerms]);

  const handleSubjectLinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    subject: string
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
    window.scrollTo({ top: 0, behavior: 'auto' });
    onSelectSubject(subject);
    onSelectBucket(null);
  };

  const handleBucketLinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    bucket: string
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
    onSelectBucket(bucket);
  };

  return (
    <div className="dictionary-browser">
      <div className="dictionary-header">
        <div>
          <h2 className="hebrew-text" style={{ margin: 0 }}>
            {dictionaryName}
          </h2>
        </div>
      </div>

      {!selectedSubject ? (
        <div className="dictionary-list subjects-list" role="list">
          {subjects.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
              אין נושאים זמינים עדיין.
            </p>
          ) : (
            subjects.map((subject) => (
              <div
                key={subject}
                className="dictionary-card subject-card"
              >
                <div className="dictionary-card-content">
                  <a
                    className="dictionary-card-name"
                    href={getSubjectHref(subject)}
                    onClick={(event) => handleSubjectLinkClick(event, subject)}
                  >
                    {subject}
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="results-container">
          <div className="dictionary-header subject-header">
            <h3 className="hebrew-text" style={{ margin: 0 }}>
              {selectedSubject}
            </h3>
          </div>

          {subjectTerms.length > SUBJECT_TERM_CHUNK_THRESHOLD && (
            <div className="subject-buckets" role="tablist" aria-label="חלוקה לפי אות">
              {buckets.map((bucket) => (
                <a
                  key={bucket}
                  className={`subject-bucket ${selectedBucket === bucket ? 'active' : ''}`}
                  href={getBucketHref(bucket)}
                  onClick={(event) => handleBucketLinkClick(event, bucket)}
                  aria-selected={selectedBucket === bucket}
                >
                  {bucket}
                </a>
              ))}
            </div>
          )}

          <div className="results-info">
            נמצאו {subjectTerms.length} מונחים
            {subjectTerms.length > SUBJECT_TERM_CHUNK_THRESHOLD && selectedBucket
              ? ` · מציג אות ${selectedBucket} (${displayedTerms.length})`
              : ''}
          </div>

          {displayedTerms.length > 0 ? (
            <div className="results-list">
              {displayedTerms.map((term) => (
                <TermItem
                  key={`${term.dictionary_code}-${term.id}-${term.male}`}
                  term={term}
                  useVowels={useVowels}
                  onTermClick={onTermClick}
                  onSearchText={onSearchText}
                  getSearchHref={getSearchHref}
                  getDictionaryHref={getDictionaryHref}
                  getSubjectHref={getSubjectHref}
                  onOpenDictionary={onOpenDictionary}
                  onOpenDictionarySubject={onOpenDictionarySubject}
                />
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
              אין מונחים להצגה עבור הבחירה הנוכחית
            </p>
          )}
        </div>
      )}
    </div>
  );
};
