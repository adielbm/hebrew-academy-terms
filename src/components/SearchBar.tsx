import { forwardRef } from 'react';

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ query, onQueryChange, onSearch }, ref) => {
    return (
      <div className="search-bar">
        <input
          ref={ref}
          type="search"
          placeholder="חפשו מונח..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearch();
            }
          }}
          aria-label="חיפוש מונח"
        />
      </div>
    );
  }
);

SearchBar.displayName = 'SearchBar';
