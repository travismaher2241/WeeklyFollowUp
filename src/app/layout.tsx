import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Weekly Follow-Up · Plasgain', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="brand-logo" src="/plasgain-logo.png" alt="Plasgain" />
              <div className="brand-app">Weekly Follow-Up</div>
            </div>
            <nav className="side-nav">
              <a className="side-link active" href="/">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M4 10h16M9 3v4M15 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Follow-Up
              </a>
            </nav>
            <div id="sidebar-slot" className="sidebar-slot" />
            <div className="side-foot">Data from Ostendo · read only</div>
          </aside>
          <div className="workspace">{children}</div>
        </div>
      </body>
    </html>
  );
}
