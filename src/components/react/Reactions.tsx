import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ClickSpark from '@/components/reactbits/ClickSpark';
import CountUp from '@/components/reactbits/CountUp';
import { emojiDataSync, itemFromKey, loadEmojiData, shortName, type EmojiItem } from '@/lib/emoji/client';
import { u } from '@/lib/url';
import { EmojiGlyph } from './EmojiGlyph';
import { EmojiPicker } from './EmojiPicker';

export interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
  names: string[];
}

interface Props {
  postId: number;
  initial: ReactionSummary[];
  loggedIn: boolean;
}

function who(r: ReactionSummary, label: string) {
  const shown = r.names.slice(0, 5);
  const others = r.count - shown.length;
  if (shown.length === 0) return `${r.count} reacted with ${label}`;
  const list =
    others > 0
      ? `${shown.join(', ')} and ${others} other${others === 1 ? '' : 's'}`
      : shown.length > 1
        ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`
        : shown[0];
  return `${list} reacted with ${label}`;
}

/** Count that rolls between values when it changes (React Bits CountUp), static on first paint. */
function Count({ value }: { value: number }) {
  const prev = useRef(value);
  const from = prev.current;
  useEffect(() => {
    prev.current = value;
  }, [value]);
  if (from === value) return <span className="count">{value}</span>;
  return <CountUp key={`${from}-${value}`} className="count" from={from} to={value} duration={0.35} trigger="load" />;
}

export default function Reactions({ postId, initial, loggedIn }: Props) {
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const busy = useRef(false);

  // names/labels for custom vs unicode keys need the emoji list; load lazily
  useEffect(() => {
    const id = setTimeout(() => loadEmojiData().then(() => force((n) => n + 1), () => {}), 400);
    return () => clearTimeout(id);
  }, []);
  const data = emojiDataSync();

  const requireLogin = () => {
    window.dispatchEvent(new CustomEvent('blog:login', { detail: { next: location.pathname } }));
  };

  async function toggle(key: string) {
    if (!loggedIn) return requireLogin();
    if (busy.current) return;
    busy.current = true;
    const before = list;
    // optimistic update
    setList((cur) => {
      const i = cur.findIndex((r) => r.emoji === key);
      if (i === -1) return [...cur, { emoji: key, count: 1, mine: true, names: ['you'] }];
      const r = cur[i];
      const next = { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) };
      return next.count <= 0 ? cur.filter((_, j) => j !== i) : cur.map((x, j) => (j === i ? next : x));
    });
    try {
      const res = await fetch(u(`/api/reactions/${postId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ emoji: key }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 401) {
        setList(before);
        requireLogin();
      } else if (!res.ok) {
        setList(before);
        toast.error(body?.error ?? 'could not react');
      } else {
        setList(body as ReactionSummary[]);
      }
    } catch {
      setList(before);
      toast.error('network error');
    } finally {
      busy.current = false;
    }
  }

  const onPick = (e: EmojiItem) => {
    setOpen(false);
    const existing = list.find((r) => r.emoji === e.key);
    if (existing?.mine) return; // already reacted; picking again shouldn't un-react
    toggle(e.key);
  };

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={100}>
      <ClickSpark sparkColor="#00ff1e" sparkCount={8} sparkRadius={18} sparkSize={8} duration={380}>
        <div className="reaction-bar" role="group" aria-label="reactions">
          {list.map((r) => {
            const item = itemFromKey(data, r.emoji);
            const label = `:${shortName(item)}:`;
            return (
              <Tooltip key={r.emoji}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`pill${r.mine ? ' mine' : ''}`}
                    aria-pressed={r.mine}
                    aria-label={`${label} ${r.count}`}
                    onClick={() => toggle(r.emoji)}
                  >
                    <EmojiGlyph item={item} />
                    <Count value={r.count} />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[260px] rounded-md border border-border bg-[#1a1e22] px-2.5 py-2 text-center text-[0.78rem] leading-snug text-body"
                >
                  <span className="mb-1 block text-[1.8rem] leading-none [&_img.emoji]:size-8">
                    <EmojiGlyph item={item} />
                  </span>
                  {who(r, label)}
                </TooltipContent>
              </Tooltip>
            );
          })}

          <Popover
            open={open}
            onOpenChange={(o) => {
              if (o && !loggedIn) return requireLogin();
              setOpen(o);
            }}
          >
            <PopoverTrigger asChild>
              <button type="button" className="pill add" aria-label="add reaction">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8.5 14.5c.9 1.2 2 1.8 3.5 1.8s2.6-.6 3.5-1.8M9 9.5h.01M15 9.5h.01" strokeLinecap="round" />
                </svg>
                +
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="w-auto overflow-hidden rounded-[10px] border border-border bg-card p-0 shadow-2xl"
            >
              <EmojiPicker onPick={onPick} />
            </PopoverContent>
          </Popover>
        </div>
      </ClickSpark>
      <p className="reaction-note">{loggedIn ? '' : 'log in to react.'}</p>
    </TooltipProvider>
  );
}
