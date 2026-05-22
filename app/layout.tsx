import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Survei Kepuasan Layanan Kominfo',
  description: 'Aplikasi survei kepuasan layanan dan persepsi anti korupsi',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
