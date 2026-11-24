import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'Schematic — SQL Schema Designer',
  description:
    'Local-first SQL-to-ER diagram designer inspired by dbdiagram.io and sqltoerdiagram.com. Multi-dialect SQL, CodeMirror 6, React Flow, and ELK.js — no cloud services required.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased font-sans"
    >
      <body className="h-full w-full bg-[#0a0a0a] text-zinc-100 overflow-hidden font-sans">
        {children}
        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  );
}
