import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { u } from '@/lib/url';
import { Toasts } from './Toasts';

interface Props {
  base: string;
  user: { name: string } | null;
  isAdmin: boolean;
}

interface PostHit {
  t: string; // title
  e: string; // excerpt
  h: string; // href
  d: string | null; // published iso
}

const MAIN_SITE = 'https://alexradu.co';

/** Cmd/Ctrl+K anywhere: fuzzy search posts + jump actions (ingo.au-style). */
export default function CommandPalette({ user, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<PostHit[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blog:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blog:palette', onOpen);
    };
  }, []);

  // Prefetch on hydrate (island is client:idle) so a fast ⌘K + typing never races the fetch.
  useEffect(() => {
    if (!posts) {
      fetch(u('/api/search'))
        .then((r) => r.json())
        .then(setPosts)
        .catch(() => setPosts([]));
    }
  }, [posts]);

  const go = useCallback((href: string) => {
    setOpen(false);
    location.href = href;
  }, []);

  const run = useCallback(async (action: string) => {
    setOpen(false);
    if (action === 'login') {
      window.dispatchEvent(new CustomEvent('blog:login', { detail: { next: location.pathname } }));
    } else if (action === 'logout') {
      await fetch(u('/auth/logout'), { method: 'POST', headers: { Accept: 'application/json' } });
      location.reload();
    } else if (action === 'new') {
      const res = await fetch(u('/api/admin/posts'), { method: 'POST', headers: { Accept: 'application/json' } });
      if (!res.ok) return toast.error('could not create post');
      const post = await res.json();
      location.href = u(`/admin/edit/${post.id}`);
    }
  }, []);

  const item = 'palette-row gap-3 rounded-md px-3 py-2.5 text-body data-[selected=true]:bg-accent data-[selected=true]:text-heading';

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="search"
        description="search posts and jump around"
        showCloseButton={false}
        className="top-[14vh] translate-y-0 sm:max-w-[600px]"
      >
        <CommandInput placeholder="search posts, or type a command…" className="text-[1rem] text-heading" />
        <CommandList className="max-h-[min(420px,60vh)] p-1.5">
          <CommandEmpty className="py-8 text-center text-[0.9rem] text-dim">nothing matches.</CommandEmpty>

          {posts && posts.length > 0 && (
            <CommandGroup heading="posts" className="palette-group-head">
              {posts.map((p) => (
                <CommandItem key={p.h} value={`${p.t} ${p.h}`} keywords={[p.e]} onSelect={() => go(p.h)} className={item}>
                  <span className="palette-title max-w-[60%] flex-none truncate font-medium text-heading">{p.t || 'untitled'}</span>
                  <span className="min-w-0 flex-1 truncate text-[0.82rem] text-dim">{p.e}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="go to" className="palette-group-head">
            <CommandItem value="home posts index" onSelect={() => go(u('/'))} className={item}>
              <span className="palette-title text-heading">home</span>
              <span className="text-[0.82rem] text-dim">all posts</span>
              <CommandShortcut>/blog</CommandShortcut>
            </CommandItem>
            <CommandItem value="back to alexradu.co portfolio main site" onSelect={() => go(MAIN_SITE)} className={item}>
              <span className="palette-title text-heading">back to alexradu.co</span>
              <CommandShortcut>↗</CommandShortcut>
            </CommandItem>
            <CommandItem value="rss feed subscribe" onSelect={() => go(u('/rss.xml'))} className={item}>
              <span className="palette-title text-heading">rss</span>
              <span className="text-[0.82rem] text-dim">subscribe</span>
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="account" className="palette-group-head">
            {isAdmin && (
              <>
                <CommandItem value="admin dashboard posts" onSelect={() => go(u('/admin'))} className={item}>
                  <span className="palette-title text-heading">admin</span>
                  <span className="text-[0.82rem] text-dim">all posts + drafts</span>
                </CommandItem>
                <CommandItem value="new post write draft" onSelect={() => run('new')} className={item}>
                  <span className="palette-title text-heading">new post</span>
                  <CommandShortcut>draft</CommandShortcut>
                </CommandItem>
              </>
            )}
            {user ? (
              <CommandItem value="logout log out sign out" onSelect={() => run('logout')} className={item}>
                <span className="palette-title text-heading">log out</span>
                <span className="text-[0.82rem] text-dim">{user.name}</span>
              </CommandItem>
            ) : (
              <CommandItem value="login log in sign in hack club github" onSelect={() => run('login')} className={item}>
                <span className="palette-title text-heading">log in</span>
                <span className="text-[0.82rem] text-dim">hack club or github</span>
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </CommandDialog>
      <Toasts />
    </>
  );
}
