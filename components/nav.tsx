'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageCircle, FileText, DollarSign, Building2, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/',          label: 'Home',    Icon: Home },
  { href: '/chat',      label: 'Chat',    Icon: MessageCircle },
  { href: '/documents', label: 'Docs',    Icon: FileText },
  { href: '/finance',   label: 'Finance', Icon: DollarSign },
  { href: '/rentals',   label: 'Rentals', Icon: Building2 },
  { href: '/taxes',     label: 'Taxes',   Icon: Calculator },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-pb">
      <div className="flex max-w-lg mx-auto">
        {links.map(({ href, label, Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-2 text-xs font-medium transition-colors min-h-[56px]',
                active ? 'text-sky-600' : 'text-gray-500 hover:text-gray-800',
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="mt-0.5 text-[10px]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
