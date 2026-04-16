import { FC } from 'react';

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
}

export const SearchBar: FC<SearchBarProps> = ({
  query,
  onQueryChange,
  onSearch,
}) => {
  return (
    <div className="search-bar">
      <input
        type="search"
        placeholder="חפש מונח..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSearch();
          }
        }}
        aria-label="חיפוש מונח"
      />

      <button onClick={onSearch} aria-label="בצע חיפוש">
        חפש
      </button>
    </div>
  );
};
