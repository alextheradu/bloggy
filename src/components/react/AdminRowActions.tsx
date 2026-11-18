import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { u } from '@/lib/url';

export default function AdminRowActions({ id, title, href }: { id: number; title: string; href: string }) {
  async function del() {
    const res = await fetch(u(`/api/admin/posts/${id}`), { method: 'DELETE' });
    if (!res.ok) return toast.error('delete failed');
    location.reload();
  }
  return (
    <span className="actions">
      <a className="btn" href={u(`/admin/edit/${id}`)}>
        edit
      </a>
      <a className="btn" href={href}>
        view
      </a>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button type="button" className="btn danger">
            delete
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>delete this post?</AlertDialogTitle>
            <AlertDialogDescription className="text-body">
              “{title || 'untitled'}” and its reactions will be gone for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="btn h-auto">cancel</AlertDialogCancel>
            <AlertDialogAction className="btn danger h-auto" onClick={del}>
              delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
