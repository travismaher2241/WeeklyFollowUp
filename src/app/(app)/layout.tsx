// Staff-only pages (behind the app password, see src/middleware.ts). The customer page lives outside this group.
import SideNav from './SideNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/plasgain-logo.png" alt="Plasgain" />
          <div className="brand-app">Weekly Follow-Up</div>
        </div>
        <SideNav />
        <div id="sidebar-slot" className="sidebar-slot" />
        <div className="side-foot">
          Data from Ostendo · read only
          <form method="post" action="/api/logout">
            <button className="link side-logout" type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="workspace">{children}</div>
    </div>
  );
}
