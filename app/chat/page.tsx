'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ChatInterface from '@/components/chat-interface';

function ChatPage() {
  const params = useSearchParams();
  const initialQ = params.get('q') ?? undefined;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="px-4 pt-6 pb-3 border-b border-gray-100 bg-gray-50">
        <h1 className="text-lg font-bold text-gray-900">Chat</h1>
        <p className="text-xs text-gray-400">Searches your docs + live web</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatInterface initialQuestion={initialQ} />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}
