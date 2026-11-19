import { getFollowUpData } from '@/lib/followup';
import { OstendoError } from '@/lib/ostendo';
import { todayMelbourne } from '@/lib/rules';
import FollowUpView from './FollowUpView';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function Home() {
  try {
    const data = await getFollowUpData();
    return <FollowUpView data={data} today={todayMelbourne()} />;
  } catch (e) {
    const msg = e instanceof OstendoError ? e.message : 'Something went wrong reading Ostendo.';
    return (
      <main>
        <h1>Weekly Follow-Up</h1>
        <div className="card">
          <p className="bad"><strong>Couldn&apos;t load the lists from Ostendo.</strong></p>
          <p>{msg}</p>
          <p className="muted">If it says the connection failed or timed out, try again in a few minutes.</p>
        </div>
      </main>
    );
  }
}
