import { ReactRenderer } from '@tiptap/react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { SuggestionMenu, type SuggestionMenuHandle } from './SuggestionMenu';

/** Shared popup renderer for @tiptap/suggestion: fixed-position under the caret. */
export function suggestionRenderer(opts: { title?: string; empty?: string; toItems: (items: any[]) => any[] }) {
  return () => {
    let renderer: ReactRenderer<SuggestionMenuHandle> | null = null;
    let el: HTMLDivElement | null = null;

    const place = (props: SuggestionProps) => {
      const rect = props.clientRect?.();
      if (!rect || !el) return;
      const h = el.offsetHeight || 260;
      const below = rect.bottom + 6;
      const top = below + h > innerHeight - 8 ? Math.max(8, rect.top - h - 6) : below;
      el.style.top = `${top}px`;
      el.style.left = `${Math.min(rect.left, innerWidth - (el.offsetWidth || 280) - 8)}px`;
    };

    const propsFor = (p: SuggestionProps) => ({
      items: opts.toItems(p.items),
      command: (item: any) => p.command(item),
      title: opts.title,
      empty: p.query ? opts.empty : undefined,
    });

    return {
      onStart: (props: SuggestionProps) => {
        renderer = new ReactRenderer(SuggestionMenu, { props: propsFor(props), editor: props.editor });
        el = document.createElement('div');
        el.className = 'suggest-host';
        el.appendChild(renderer.element);
        document.body.appendChild(el);
        requestAnimationFrame(() => place(props));
      },
      onUpdate: (props: SuggestionProps) => {
        renderer?.updateProps(propsFor(props));
        if (el) el.style.display = '';
        requestAnimationFrame(() => place(props));
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === 'Escape') {
          if (el) el.style.display = 'none';
          return true;
        }
        if (el?.style.display === 'none') return false;
        return renderer?.ref?.onKeyDown(props.event) ?? false;
      },
      onExit: () => {
        el?.remove();
        renderer?.destroy();
        el = null;
        renderer = null;
      },
    };
  };
}
