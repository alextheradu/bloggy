import { toast } from 'sonner';
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
            <AlertDialogPrimitive.Cancel className="btn">cancel</AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action className="btn danger" onClick={del}>
              delete
            </AlertDialogPrimitive.Action>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
