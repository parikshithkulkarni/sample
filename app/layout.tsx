import type { Metadata, Viewport } from 'next';
import './globals.css';
import Nav from '@/components/nav';
import CaptureModal from '@/components/capture-modal';
import AuthProvider from '@/components/auth-provider';
import DbWarmer from '@/components/db-warmer';

export const metadata: Metadata = {
  title: 'Second Brain',
  description: 'Your private AI knowledge system',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <DbWarmer />
          <main className="max-w-lg mx-auto min-h-screen pb-20">
            {children}
          </main>
          <Nav />
          <CaptureModal />
        </AuthProvider>
      </body>
    </html>
  );
}
