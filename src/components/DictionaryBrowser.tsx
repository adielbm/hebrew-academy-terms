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
  onSelectSubject: (subject: string | null) => void;
  onSelectBucket: (bucket: string | null) => void;
  getSubjectHref: (subject: string) => string;
  getBucketHref: (bucket: string) => string;
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
  getSubjectHref,
  getBucketHref,
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
  }, [dictionaryCode, selectedSubject]);

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
    if (subjectTerms.length <= SUBJECT_TERM_CHUNK_THRESHOLD) {
      if (selectedBucket !== null) {
        onSelectBucket(null);
      }
      return;
    }

    if (selectedBucket && buckets.includes(selectedBucket)) {
      return;
    }

    onSelectBucket(buckets[0] ?? null);
  }, [buckets, onSelectBucket, selectedBucket, subjectTerms.length]);

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
        <div className="subjects-list" role="list">
          {subjects.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-light)' }}>
              אין נושאים זמינים עדיין.
            </p>
          ) : (
            subjects.map((subject) => (
              <a
                key={subject}
                className="subject-card"
                href={getSubjectHref(subject)}
                onClick={(event) => handleSubjectLinkClick(event, subject)}
              >
                {subject}
              </a>
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
