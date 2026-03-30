'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageCircle, FileText, DollarSign, Building2, Calculator, Sun, Moon, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';

const links = [
  { href: '/',          label: 'Home',    Icon: Home },
  { href: '/chat',      label: 'Chat',    Icon: MessageCircle },
  { href: '/documents', label: 'Docs',    Icon: FileText },
  { href: '/finance',   label: 'Finance', Icon: DollarSign },
  { href: '/rentals',   label: 'Rentals', Icon: Building2 },
  { href: '/taxes',     label: 'Taxes',   Icon: Calculator },
  { href: '/audit',     label: 'Audit',   Icon: ShieldCheck },
];

export default function Nav() {
  const path = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  function toggleTheme() {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 safe-area-pb lg:top-0 lg:right-auto lg:w-64 lg:border-t-0 lg:border-r lg:flex lg:flex-col">
      <div className="flex max-w-lg mx-auto lg:max-w-none lg:flex-col lg:flex-1 lg:px-3 lg:py-6 lg:gap-1">
        {/* App title - desktop only */}
        <div className="hidden lg:flex items-center gap-2 px-3 mb-6">
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">Second Brain</span>
        </div>

        {links.map(({ href, label, Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-2 text-xs font-medium transition-colors min-h-[56px]',
                'lg:flex-row lg:flex-none lg:gap-3 lg:px-3 lg:py-2.5 lg:rounded-xl lg:min-h-0 lg:justify-start',
                active
                  ? 'text-sky-600 dark:text-sky-400 lg:bg-sky-50 lg:dark:bg-sky-950'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 lg:hover:bg-gray-50 lg:dark:hover:bg-gray-800',
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="mt-0.5 text-[10px] lg:mt-0 lg:text-sm">{label}</span>
            </Link>
          );
        })}

        {/* Theme toggle */}
        <div className="hidden lg:flex lg:mt-auto lg:px-3">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-full"
            aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {resolvedTheme === 'dark' ? <Sun size={20} strokeWidth={1.8} /> : <Moon size={20} strokeWidth={1.8} />}
            <span>{resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </div>

      {/* Mobile theme toggle - compact */}
      <button
        onClick={toggleTheme}
        className="absolute -top-12 right-3 w-9 h-9 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shadow-sm lg:hidden"
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {resolvedTheme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-gray-500" />}
      </button>
    </nav>
  );
}
