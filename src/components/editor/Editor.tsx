import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, useEditorState, EditorContent, type Editor as TEditor } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import type { JSONContent } from '@tiptap/core';
import { toast } from 'sonner';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Minus,
  ImageIcon,
  Link2,
  Smile,
  ArrowUpRight,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
// raw Radix parts for the footer: the shadcn wrappers add <Button> utility
// classes that would override .btn
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { Toasts } from '@/components/react/Toasts';
import { EmojiPicker } from '@/components/react/EmojiPicker';
import { baseExtensions } from '@/lib/editor/extensions';
import { loadEmojiData } from '@/lib/emoji/client';
import { slugify } from '@/lib/slug';
import { u } from '@/lib/url';
import { EmojiInputRule, EmojiSuggestion, SlashCommand, convertPendingShortcodes, insertEmoji } from './editor-extensions';

type Status = 'draft' | 'published' | 'unlisted';

export interface EditorPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  status: Status;
  contentJson: JSONContent;
  publishedAt: string | null;
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

const AUTOSAVE_MS = 1200;
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(u('/api/admin/upload'), { method: 'POST', body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `upload failed (${res.status})`);
  return body.url as string;
}

export default function Editor({ post }: { post: EditorPost }) {
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [status, setStatus] = useState<Status>(post.status);
  const [publishedAt, setPublishedAt] = useState(post.publishedAt);
  const [save, setSave] = useState<SaveState>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(0);

  // the slug follows the title until it's edited by hand or the post has gone live once
  const slugLocked = useRef(!!post.publishedAt || !post.slug.startsWith('untitled'));
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});
  const inflight = useRef<Promise<void> | null>(null);
  const editorRef = useRef<TEditor | null>(null);

  useEffect(() => {
    loadEmojiData()
      .then(() => editorRef.current && convertPendingShortcodes(editorRef.current))
      .catch(() => toast.error("couldn't load emoji list"));
  }, []);

  // ---------- saving ----------

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inflight.current) await inflight.current;
    const body = pending.current;
    if (!Object.keys(body).length) return true;
    pending.current = {};
    setSave('saving');
    let ok = false;
    inflight.current = (async () => {
      try {
        const res = await fetch(u(`/api/admin/posts/${post.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `save failed (${res.status})`);
        if (data.slug && document.activeElement?.id !== 'post-slug') setSlug(data.slug);
        setStatus(data.status);
        setPublishedAt(data.publishedAt);
        setSavedAt(new Date());
        setSave(Object.keys(pending.current).length ? 'dirty' : 'saved');
        ok = true;
      } catch (err) {
        pending.current = { ...body, ...pending.current }; // keep for retry
        setSave('error');
        toast.error((err as Error).message);
      }
    })();
    await inflight.current;
    inflight.current = null;
    return ok;
  }, [post.id]);

  /** Queue a change. Drafts autosave; live posts wait for an explicit save so half-edits never go public. */
  const queue = useCallback(
    (patch: Record<string, unknown>, live = status !== 'draft') => {
      pending.current = { ...pending.current, ...patch };
      setSave('dirty');
      if (timer.current) clearTimeout(timer.current);
      if (!live) timer.current = setTimeout(flush, AUTOSAVE_MS);
    },
    [flush, status],
  );

  // ---------- editor ----------

  const pickImage = useCallback(() => fileInput.current?.click(), []);
  const openLink = useCallback(() => {
    const ed = editorRef.current;
    setLinkUrl(ed?.getAttributes('link').href ?? '');
    setLinkOpen(true);
  }, []);

  const insertFiles = useCallback(async (files: File[], pos?: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    for (const file of files.filter((f) => f.type.startsWith('image/'))) {
      setUploading((n) => n + 1);
      try {
        const src = await uploadImage(file);
        const chain = ed.chain().focus();
        if (pos != null) chain.insertContentAt(pos, { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, '') } });
        else chain.setImage({ src, alt: file.name.replace(/\.[^.]+$/, '') });
        chain.run();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }, []);

  const extensions = useMemo(
    () => [
      ...baseExtensions,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === 'heading' ? 'heading' : 'write something…  type / for blocks, : for emoji',
      }),
      SlashCommand.configure({ onImage: pickImage, onLink: openLink }),
      EmojiSuggestion,
      EmojiInputRule,
    ],
    [pickImage, openLink],
  );

  const editor = useEditor({
    extensions,
    content: post.contentJson,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'prose editor-surface', 'aria-label': 'post body' },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        insertFiles(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertFiles(files, pos);
        return true;
      },
    },
    onUpdate: ({ editor }) => queue({ contentJson: editor.getJSON() }),
  });
  editorRef.current = editor;

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            strike: e.isActive('strike'),
            code: e.isActive('code'),
            h1: e.isActive('heading', { level: 1 }),
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            ul: e.isActive('bulletList'),
            ol: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            codeBlock: e.isActive('codeBlock'),
            link: e.isActive('link'),
          }
        : null,
  });

  // ---------- keyboard + unload ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        flush().then((ok) => ok && toast.success('saved'));
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || inflight.current) e.preventDefault();
    };
    addEventListener('keydown', onKey);
    addEventListener('beforeunload', onUnload);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('beforeunload', onUnload);
    };
  }, [flush]);

  // ---------- actions ----------

  async function changeStatus(next: Status) {
    pending.current = { ...pending.current, status: next };
    if (editor) pending.current.contentJson = editor.getJSON();
    const ok = await flush();
    if (ok) {
      if (next === 'published') toast.success('published', { action: { label: 'view', onClick: () => open(u(`/${slug}`)) } });
      else toast.success(next === 'unlisted' ? 'unlisted (link only)' : 'moved back to drafts');
    }
  }

  async function del() {
    const res = await fetch(u(`/api/admin/posts/${post.id}`), { method: 'DELETE' });
    if (!res.ok) return toast.error('delete failed');
    pending.current = {};
    location.href = u('/admin');
  }

  function applyLink() {
    if (!editor) return;
    const href = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!href) chain.unsetLink().run();
    else chain.setLink({ href: /^(https?:|mailto:|\/|#)/.test(href) ? href : `https://${href}` }).run();
    setLinkOpen(false);
  }

  // ---------- render ----------

  const tb = (
    label: string,
    pressed: boolean | undefined,
    onClick: () => void,
    icon: React.ReactNode,
    kbd?: string,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={!!pressed}
          onPressedChange={onClick}
          aria-label={label}
          className="tb-btn h-8 min-w-8 rounded-md px-1.5 text-[#9aa1a8] hover:bg-accent hover:text-heading data-[state=on]:bg-[#1f2428] data-[state=on]:text-heading"
        >
          {icon}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="rounded-md border border-border bg-[#1a1e22] px-2 py-1 font-mono text-[0.7rem] text-body">
        {label}
        {kbd && <span className="ml-2 text-faint">{kbd}</span>}
      </TooltipContent>
    </Tooltip>
  );

  const ic = 'size-4';
  const e = editor;
  const saveLabel =
    save === 'saving'
      ? 'saving…'
      : save === 'error'
        ? 'save failed, retry ⌘s'
        : save === 'dirty'
          ? status === 'draft'
            ? 'editing…'
            : 'unsaved changes · ⌘s'
          : savedAt
            ? `saved ${timeFmt.format(savedAt).toLowerCase()}`
            : 'all changes saved';

  return (
    <TooltipProvider delayDuration={400}>
      <div className="editor-wrap">
        <div className="editor-meta">
          <a className="plain back" href={u('/admin')}>
            ← all posts
          </a>
          <span className={`save-state ${save}`}>{saveLabel}</span>
          <div className="editor-actions">
            <a className="btn" href={u(`/${slug}`)} target="_blank" rel="noopener">
              view <ArrowUpRight className="size-3.5" />
            </a>
            <Select value={status} onValueChange={(v) => changeStatus(v as Status)}>
              <SelectTrigger size="sm" className="status-select h-[29px] w-[120px] rounded-[5px] border border-[#23272b] bg-transparent font-mono text-[0.78rem] text-[#9aa1a8]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border border-border bg-card font-mono text-[0.78rem]">
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="unlisted">unlisted</SelectItem>
                <SelectItem value="published">published</SelectItem>
              </SelectContent>
            </Select>
            {status === 'draft' ? (
              <button type="button" className="btn primary" onClick={() => changeStatus('published')}>
                publish
              </button>
            ) : (
              <button type="button" className="btn primary" disabled={save === 'saved'} onClick={() => flush().then((ok) => ok && toast.success('saved'))}>
                save
              </button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="btn danger" aria-label="delete post">
                  <Trash2 className="size-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[400px]">
                <AlertDialogHeader>
                  <AlertDialogTitle>delete this post?</AlertDialogTitle>
                  <AlertDialogDescription className="text-body">
                    “{title || 'untitled'}” and its reactions will be gone for good. uploaded images stay in the bucket.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogPrimitive.Cancel className="btn">cancel</AlertDialogPrimitive.Cancel>
                  <AlertDialogPrimitive.Action className="btn danger" onClick={del}>
                    delete
                  </AlertDialogPrimitive.Action>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <input
          className="title-input"
          value={title}
          placeholder="post title"
          aria-label="title"
          onChange={(ev) => {
            const t = ev.target.value;
            setTitle(t);
            const patch: Record<string, unknown> = { title: t };
            if (!slugLocked.current && t.trim()) {
              const s = slugify(t);
              setSlug(s);
              patch.slug = s;
            }
            queue(patch);
          }}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              editor?.commands.focus('start');
            }
          }}
        />

        <div className="meta-fields" role="group" aria-label="post details">
          <div className="panel-label">post details</div>
          <div className="field slug-field">
            <label htmlFor="post-slug">slug</label>
            <div className="slug-row">
              <span className="slug-prefix">/blog/</span>
              <input
                id="post-slug"
                className="input"
                value={slug}
                spellCheck={false}
                onChange={(ev) => {
                  slugLocked.current = true;
                  const s = ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                  setSlug(s);
                  if (s.replace(/-/g, '')) queue({ slug: s });
                }}
                onBlur={() => setSlug((s) => slugify(s))}
              />
            </div>
            {publishedAt && (
              <span className="field-note">live since {new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase()}. changing the slug breaks old links</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="post-excerpt">excerpt</label>
            <textarea
              id="post-excerpt"
              className="input"
              rows={2}
              maxLength={500}
              value={excerpt}
              placeholder="one or two lines for the index, rss and link previews"
              onChange={(ev) => {
                setExcerpt(ev.target.value);
                queue({ excerpt: ev.target.value });
              }}
            />
          </div>
        </div>

        <div className="editor-doc">
        <div className="toolbar" role="toolbar" aria-label="formatting">
          {tb('heading 1', active?.h1, () => e?.chain().focus().toggleHeading({ level: 1 }).run(), <Heading1 className={ic} />)}
          {tb('heading 2', active?.h2, () => e?.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className={ic} />)}
          {tb('heading 3', active?.h3, () => e?.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 className={ic} />)}
          <span className="tb-sep" />
          {tb('bold', active?.bold, () => e?.chain().focus().toggleBold().run(), <Bold className={ic} />, '⌘b')}
          {tb('italic', active?.italic, () => e?.chain().focus().toggleItalic().run(), <Italic className={ic} />, '⌘i')}
          {tb('strikethrough', active?.strike, () => e?.chain().focus().toggleStrike().run(), <Strikethrough className={ic} />, '⌘⇧s')}
          {tb('inline code', active?.code, () => e?.chain().focus().toggleCode().run(), <Code className={ic} />, '⌘e')}
          <span className="tb-sep" />
          {tb('bulleted list', active?.ul, () => e?.chain().focus().toggleBulletList().run(), <List className={ic} />)}
          {tb('numbered list', active?.ol, () => e?.chain().focus().toggleOrderedList().run(), <ListOrdered className={ic} />)}
          {tb('quote', active?.quote, () => e?.chain().focus().toggleBlockquote().run(), <Quote className={ic} />)}
          {tb('code block', active?.codeBlock, () => e?.chain().focus().toggleCodeBlock().run(), <Code2 className={ic} />)}
          <span className="tb-sep" />
          <Popover open={linkOpen} onOpenChange={setLinkOpen}>
            <PopoverTrigger asChild>
              <span>{tb('link', active?.link, openLink, <Link2 className={ic} />)}</span>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[320px] rounded-[10px] border border-border bg-card p-3">
              <form
                className="flex gap-2"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  applyLink();
                }}
              >
                <input
                  autoFocus
                  className="input"
                  placeholder="https://… (empty removes)"
                  value={linkUrl}
                  onChange={(ev) => setLinkUrl(ev.target.value)}
                />
                <button className="btn" type="submit">
                  set
                </button>
              </form>
            </PopoverContent>
          </Popover>
          {tb('divider', false, () => e?.chain().focus().setHorizontalRule().run(), <Minus className={ic} />)}
          {tb('image', false, pickImage, uploading ? <Loader2 className={`${ic} animate-spin`} /> : <ImageIcon className={ic} />)}
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <span>{tb('emoji', emojiOpen, () => setEmojiOpen(true), <Smile className={ic} />, ':')}</span>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto overflow-hidden rounded-[10px] border border-border bg-card p-0 shadow-2xl">
              <EmojiPicker
                onPick={(item) => {
                  setEmojiOpen(false);
                  if (editor) insertEmoji(editor, item);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        <EditorContent editor={editor} className="editor-body" />

        <div className="editor-hint" aria-hidden="true">
          <span><kbd>/</kbd> blocks</span>
          <span><kbd>:</kbd> emoji</span>
          <span>paste or drop images</span>
          <span><kbd>⌘s</kbd> save</span>
        </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          multiple
          hidden
          onChange={(ev) => {
            insertFiles([...(ev.target.files ?? [])]);
            ev.target.value = '';
          }}
        />
      </div>
      <Toasts />
    </TooltipProvider>
  );
}
