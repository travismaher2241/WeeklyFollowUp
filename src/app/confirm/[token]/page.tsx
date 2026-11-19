// PUBLIC customer page. Shows only the orders saved on this one link. No prices, and no Ostendo access.
import type { Metadata } from 'next';
import { friendlyError } from '@/lib/firebase';
import { getLink, statusOf, storeConfigured } from '@/lib/confirmStore';
import { SALES_EMAIL, type PublicLink } from '@/lib/confirmRules';
import { todayMelbourne } from '@/lib/rules';
import ConfirmForm from './ConfirmForm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Confirm your delivery dates · Plasgain', robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public">
      <header className="public-bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/plasgain-logo.png" alt="Plasgain" />
        <span>Delivery date confirmation</span>
      </header>
      <main className="public-main">{children}</main>
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <Shell>
      <div className="card">
        <h1>{title}</h1>
        <p>{text}</p>
        <p>
          Please contact us at <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
        </p>
      </div>
    </Shell>
  );
}

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!storeConfigured()) return <Message title="Not available right now" text="Sorry, this page can't be opened at the moment." />;
  let link;
  try {
    link = await getLink(token);
  } catch (e) {
    friendlyError(e);
    return <Message title="Not available right now" text="Sorry, this page can't be opened at the moment. Please try again shortly." />;
  }
  if (!link) return <Message title="Link not found" text="This link isn't valid. Please check you copied the whole link." />;
  const status = statusOf(link);
  if (status === 'expired') return <Message title="This link has expired" text="Ask us for a new link if you still need to confirm your delivery dates." />;
  if (status === 'cancelled') return <Message title="This link is no longer active" text="Ask us for a new link if you still need to confirm your delivery dates." />;

  const data: PublicLink = {
    customer: link.customer,
    contactName: link.contactName,
    expiresAt: link.expiresAt,
    status,
    orders: link.orders,
    response: link.response,
    today: todayMelbourne(),
  };
  return (
    <Shell>
      <ConfirmForm token={token} data={data} />
    </Shell>
  );
}
