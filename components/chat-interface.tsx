'use client';

import { useChat } from 'ai/react';
import { Send, Globe, FileText, Database } from 'lucide-react';
import { useRef, useEffect } from 'react';

interface Props {
  initialQuestion?: string;
}

// Safe citation renderer — no dangerouslySetInnerHTML
function MessageContent({ content }: { content: string }) {
  // Split on [doc: ...] and [web: ...] citations
  const parts = content.split(/(\[(?:doc|web): [^\]]+\])/g);
  return (
    <span>
      {parts.map((part, i) => {
        const docMatch = part.match(/^\[doc: ([^\]]+)\]$/);
        const webMatch = part.match(/^\[web: ([^\]]+)\]$/);
        if (docMatch) {
          return (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-medium mx-0.5">
              <FileText size={10} /> {docMatch[1]}
            </span>
          );
        }
        if (webMatch) {
          return (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium mx-0.5">
              <Globe size={10} /> {webMatch[1]}
            </span>
          );
        }
        // Render plain text — preserve line breaks
        return <span key={i} className="whitespace-pre-wrap">{part}</span>;
      })}
    </span>
  );
}

export default function ChatInterface({ initialQuestion }: Props) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, append } = useChat({
    api: '/api/chat',
  });

  const sentRef = useRef(false);
  useEffect(() => {
    if (initialQuestion && !sentRef.current) {
      sentRef.current = true;
      append({ role: 'user', content: initialQuestion });
    }
  }, [initialQuestion, append]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-2">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-16">
            <p className="text-2xl mb-2">🧠</p>
            <p>Ask anything about your finances,</p>
            <p>documents, taxes, or the web.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-sky-600 text-white rounded-br-sm whitespace-pre-wrap'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              {m.role === 'user' ? m.content : <MessageContent content={m.content} />}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3 bg-white">
        <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
          <span className="flex items-center gap-1"><Database size={11} /> Live data</span>
          <span className="flex items-center gap-1"><FileText size={11} /> Docs</span>
          <span className="flex items-center gap-1"><Globe size={11} /> Web</span>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask anything..."
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="w-12 h-12 bg-sky-600 rounded-xl flex items-center justify-center text-white disabled:opacity-50 active:scale-95 transition-transform shrink-0"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
