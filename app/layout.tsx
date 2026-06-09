import type { Metadata } from 'next';
import { KOMDIGI_LOGO_URL } from './services';
import './globals.css';

export const metadata: Metadata = {
  title: 'Survei Kepuasan Layanan Komdigi',
  description: 'Aplikasi Survei Kepuasan Layanan dan Persepsi Anti Korupsi',
  icons: {
    icon: KOMDIGI_LOGO_URL,
    shortcut: KOMDIGI_LOGO_URL,
    apple: KOMDIGI_LOGO_URL,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
