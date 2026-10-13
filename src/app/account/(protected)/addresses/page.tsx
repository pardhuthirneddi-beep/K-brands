import { ensureDb } from '@/lib/bootstrap.ts';
import { requireUser } from '@/lib/session.ts';
import { all } from '@/db/client.ts';
import { AddressBook } from '@/components/account/address-book.tsx';

ensureDb();
export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  // requireUser, not readUser: the layout check alone is not enough under streaming, and a
  // non-null assertion here would turn a signed-out visitor into a crash rather than a redirect.
  const user = await requireUser('/account/addresses');
  const addresses = all<Record<string, unknown>>(
    'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default_shipping DESC, id DESC',
    [user.id],
  ) as {
    id: number;
    label: string;
    recipient_name: string;
    phone: string;
    line1: string;
    line2: string | null;
    locality: string | null;
    city: string;
    state_name: string;
    state_code: string;
    pincode: string;
    country_code: string;
    is_default_shipping: number;
  }[];
  return (
    <div>
      <h1 className="display-section mb-1 text-[26px]">Addresses</h1>
      <p className="mb-6 max-w-prose text-[13.5px] leading-relaxed text-ink-500">
        Saved addresses fill in checkout for you. They stay private to your account and can be removed at any time.
      </p>
      <AddressBook initial={addresses} />
    </div>
  );
}
