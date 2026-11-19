import { getFollowUpData } from '@/lib/followup';
import { OstendoError } from '@/lib/ostendo';
import { todayMelbourne } from '@/lib/rules';
import ConfirmationsView, { type CustomerOption } from './ConfirmationsView';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function Confirmations() {
  let customers: CustomerOption[] = [];
  let ostendoError = '';
  try {
    const data = await getFollowUpData();
    const map = new Map<string, CustomerOption>();
    for (const r of data.rows) {
      if (r.kind !== 'inprogress' || !r.customer) continue;
      const c = map.get(r.customer) ?? { name: r.customer, orders: 0, contacts: [] };
      c.orders++;
      const d = Object.fromEntries(r.details);
      const name = d['Contact'] ?? '';
      const email = d['Email'] ?? '';
      if ((name || email) && !c.contacts.some((x) => x.name === name && x.email === email)) c.contacts.push({ name, email });
      map.set(r.customer, c);
    }
    customers = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    ostendoError = e instanceof OstendoError ? e.message : 'Could not read the orders from Ostendo.';
  }
  return <ConfirmationsView customers={customers} ostendoError={ostendoError} today={todayMelbourne()} />;
}
