'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useCart } from '../providers.tsx';
import { CartView } from './cart-view.tsx';

export function CartDrawer({ children }: { children?: React.ReactNode }) {
  const { drawerOpen, closeDrawer, count } = useCart();
  return (
    <Dialog.Root open={drawerOpen} onOpenChange={(open) => (open ? undefined : closeDrawer())}>
      {children ? <Dialog.Trigger asChild>{children}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-overlay bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-drawer flex w-[min(430px,94vw)] flex-col bg-ivory-50 shadow-lift outline-none data-[state=open]:animate-slide-in-right motion-reduce:data-[state=open]:animate-fade-in">
          <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
            <Dialog.Title className="font-display text-[18px]">
              Your bag{count > 0 ? ` (${String(count)})` : ''}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="text-[12px] tracking-label text-ink-500 transition hover:text-ink"
              >
                Close
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            Review the items in your bag, change quantities and continue to checkout
          </Dialog.Description>
          <div className="flex-1 overflow-y-auto px-5 pb-6">
            <CartView variant="drawer" onCheckoutClick={closeDrawer} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
