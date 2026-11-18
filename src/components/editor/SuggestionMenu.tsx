import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

export interface SuggestionMenuHandle {
  onKeyDown: (e: KeyboardEvent) => boolean;
}

interface Props {
  items: MenuItem[];
  command: (item: MenuItem) => void;
  title?: string;
  empty?: string;
}

/** Floating list used by both the "/" block menu and the ":" emoji autocomplete. */
export const SuggestionMenu = forwardRef<SuggestionMenuHandle, Props>(function SuggestionMenu(
  { items, command, title, empty },
  ref,
) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setIndex(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (!items.length) return false;
      if (e.key === 'ArrowDown') {
        setIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        setIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        command(items[index]);
        return true;
      }
      return false;
    },
  }));

  if (!items.length && !empty) return null;
  return (
    <div className="suggest" ref={listRef} role="listbox">
      {title && <div className="suggest-title">{title}</div>}
      {!items.length && <div className="suggest-empty">{empty}</div>}
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          role="option"
          data-i={i}
          aria-selected={i === index}
          className="suggest-item"
          onMouseEnter={() => setIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            command(it);
          }}
        >
          {it.icon && <span className="suggest-icon">{it.icon}</span>}
          <span className="suggest-label">{it.label}</span>
          {it.hint && <span className="suggest-hint">{it.hint}</span>}
        </button>
      ))}
    </div>
  );
});
