import { Toaster } from '@/components/ui/sonner';

// Mounted once (inside the always-present command palette island). sonner keeps
// a module-level store, so toast() from any other island lands here too.
export function Toasts() {
  return <Toaster position="bottom-center" toastOptions={{ className: 'font-sans text-[0.85rem]' }} />;
}
