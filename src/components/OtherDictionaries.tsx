import { FC } from 'react';
import { IndexedTerm } from '../types';

interface OtherDictionariesProps {
  term: IndexedTerm;
  otherDictionaries: Map<string, IndexedTerm[]>;
  onClose: () => void;
  useVowels: boolean;
}

export const OtherDictionaries: FC<OtherDictionariesProps> = ({
  term,
  otherDictionaries,
  onClose,
  useVowels,
}) => {
  const hebrew = useVowels ? term.hebrew_with_vowels : term.hebrew_without_vowels;

  if (otherDictionaries.size === 0) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{hebrew}</h2>
            <button onClick={onClose} className="modal-close" aria-label="סגור">
              ✕
            </button>
          </div>
          <p>המונח לא מופיע במילונים אחרים</p>
          <button onClick={onClose}>סגור</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{hebrew}</h2>
          <button onClick={onClose} className="modal-close" aria-label="סגור">
            ✕
          </button>
        </div>

        <div className="other-dicts-content">
          {Array.from(otherDictionaries.entries()).map(
            ([dictCode, terms]) => (
              <div key={dictCode} className="other-dict-section">
                <h3>
                  {terms[0]?.dictionary_name || `מילון ${dictCode}`}
                </h3>
                <div className="other-dict-terms">
                  {terms.map((t, index) => (
                    <div key={`${t.dictionary_code}-${t.id}-${t.hebrew_without_vowels}-${index}`} className="other-dict-term">
                      <div className="hebrew-text">
                        {useVowels
                          ? t.hebrew_with_vowels
                          : t.hebrew_without_vowels}
                      </div>
                      {t.english_translations.length > 0 && (
                        <div className="english-text">
                          {t.english_translations.join(', ')}
                        </div>
                      )}
                      {t.definition && (
                        <div className="hebrew-definition">
                          {t.definition}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        <button onClick={onClose}>סגור</button>
      </div>
    </div>
  );
};
