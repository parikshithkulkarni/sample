import type { Metadata, Viewport } from 'next';
import './globals.css';
import Nav from '@/components/nav';
import CaptureModal from '@/components/capture-modal';
import AuthProvider from '@/components/auth-provider';
import DbWarmer from '@/components/db-warmer';
import ErrorReporterProvider from '@/components/error-reporter-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/toast';

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()` }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <ErrorReporterProvider>
              <DbWarmer />
              <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[70] focus:bg-white focus:dark:bg-gray-900 focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-sm focus:font-medium">
                Skip to main content
              </a>
              <main id="main-content" className="max-w-lg mx-auto min-h-screen pb-20 lg:max-w-5xl lg:ml-64 lg:pb-4">
                <div className="animate-fadeIn">
                  {children}
                </div>
              </main>
              <Nav />
              <CaptureModal />
              </ErrorReporterProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
