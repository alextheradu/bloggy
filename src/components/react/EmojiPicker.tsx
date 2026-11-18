import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  GROUP_NAMES,
  getRecent,
  itemFromKey,
  loadEmojiData,
  pushRecent,
  searchEmoji,
  shortName,
  type EmojiData,
  type EmojiItem,
} from '@/lib/emoji/client';
import { EmojiGlyph } from './EmojiGlyph';

const COLS = 9;
const ROW_H = 37;
const HEAD_H = 28;

type Tab = 'all' | 'standard' | 'custom';
type Row = { type: 'head'; title: string } | { type: 'cells'; items: EmojiItem[] };

function toRows(sections: { title: string; items: EmojiItem[] }[]): Row[] {
  const rows: Row[] = [];
  for (const s of sections) {
    if (!s.items.length) continue;
    rows.push({ type: 'head', title: s.title });
    for (let i = 0; i < s.items.length; i += COLS) rows.push({ type: 'cells', items: s.items.slice(i, i + COLS) });
  }
  return rows;
}

export interface EmojiPickerProps {
  onPick: (item: EmojiItem) => void;
  autoFocus?: boolean;
}

/**
 * Slack-style picker: search, recently used, all/standard/custom tabs and a
 * virtualized grid (there are ~66k custom emoji, so only visible rows mount).
 */
export function EmojiPicker({ onPick, autoFocus = true }: EmojiPickerProps) {
  const [data, setData] = useState<EmojiData | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [hover, setHover] = useState<EmojiItem | null>(null);
  const [recent] = useState(getRecent);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadEmojiData().then(setData, () => setError(true));
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const kinds = tab === 'all' ? undefined : [tab === 'standard' ? 'unicode' : 'custom'] as ('unicode' | 'custom')[];
    if (q.trim()) {
      const hits = searchEmoji(data, q, { limit: 1800, kinds });
      return toRows([{ title: `results for "${q.trim()}"`, items: hits }]);
    }
    const sections: { title: string; items: EmojiItem[] }[] = [];
    if (tab === 'all' && recent.length) sections.push({ title: 'recently used', items: recent.map((k) => itemFromKey(data, k)) });
    if (tab !== 'custom') {
      const byGroup = new Map<number, EmojiItem[]>();
      for (const e of data.unicode) {
        let arr = byGroup.get(e.group);
        if (!arr) byGroup.set(e.group, (arr = []));
        arr.push(e);
      }
      for (const [g, items] of byGroup) sections.push({ title: GROUP_NAMES[g] ?? 'other', items });
    }
    if (tab !== 'standard') sections.push({ title: `hack club (${data.custom.length.toLocaleString()})`, items: data.custom });
    return toRows(sections);
  }, [data, q, tab, recent]);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.type === 'head' ? HEAD_H : ROW_H),
    overscan: 6,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [q, tab]);

  const pick = (e: EmojiItem) => {
    pushRecent(e.key);
    onPick(e);
  };

  const first = rows.find((r): r is Extract<Row, { type: 'cells' }> => r.type === 'cells')?.items[0];
  const preview = hover ?? first ?? null;

  return (
    <div className="picker-panel flex h-[400px] w-[352px] max-w-[calc(100vw-16px)] flex-col">
      <div className="picker-search">
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && first) {
              e.preventDefault();
              pick(first);
            }
          }}
          placeholder={data ? 'search emoji' : 'loading emoji…'}
          aria-label="search emoji"
          spellCheck={false}
        />
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
        <TabsList className="picker-tabs h-auto w-full justify-start rounded-none bg-transparent p-0">
          {(['all', 'standard', 'custom'] as Tab[]).map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className="flex-none rounded-none border-0 border-b border-transparent bg-transparent px-2 py-1.5 font-mono text-[0.72rem] text-dim shadow-none data-[state=active]:border-heading data-[state=active]:bg-transparent data-[state=active]:text-heading data-[state=active]:shadow-none"
            >
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div ref={scrollRef} className="picker-grid" role="grid" aria-label="emoji">
        {error ? (
          <p className="picker-empty">couldn't load emoji :(</p>
        ) : !data ? (
          <p className="picker-empty">loading…</p>
        ) : rows.length === 0 ? (
          <p className="picker-empty">no emoji match "{q}"</p>
        ) : (
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((vr) => {
              const row = rows[vr.index];
              return (
                <div
                  key={vr.key}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: vr.size, transform: `translateY(${vr.start}px)` }}
                >
                  {row.type === 'head' ? (
                    <div className="picker-section">{row.title}</div>
                  ) : (
                    <div className="picker-row" role="row">
                      {row.items.map((e) => (
                        <button
                          key={e.key}
                          type="button"
                          role="gridcell"
                          className="picker-cell"
                          title={`:${shortName(e)}:`}
                          onMouseEnter={() => setHover(e)}
                          onFocus={() => setHover(e)}
                          onClick={() => pick(e)}
                        >
                          <EmojiGlyph item={e} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="picker-foot">
        {preview && (
          <>
            <span className="preview">
              <EmojiGlyph item={preview} />
            </span>
            <span className="name">:{shortName(preview)}:</span>
            {preview.kind === 'custom' && preview.aliasOf && <span>alias of :{preview.aliasOf}:</span>}
          </>
        )}
      </div>
    </div>
  );
}
