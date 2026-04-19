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
  const hebrew = useVowels ? term.haser : term.male;

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
                    <div key={`${t.dictionary_code}-${t.id}-${t.male}-${index}`} className="other-dict-term">
                      <div className="hebrew-text">
                        {useVowels
                          ? t.haser
                          : t.male}
                      </div>
                      {t.en.length > 0 && (
                        <div className="english-text">
                          {t.en.join(', ')}
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
