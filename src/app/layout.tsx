import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Weekly Follow-Up', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
