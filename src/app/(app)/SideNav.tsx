'use client';

import { usePathname } from 'next/navigation';

export default function SideNav() {
  const path = usePathname();
  const links = path.startsWith('/confirmations');
  return (
    <nav className="side-nav">
      <a className={links ? 'side-link' : 'side-link active'} href="/">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4 10h16M9 3v4M15 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Follow-Up
      </a>
      <a className={links ? 'side-link active' : 'side-link'} href="/confirmations">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4 4 10-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        Delivery confirmations
      </a>
    </nav>
  );
}
