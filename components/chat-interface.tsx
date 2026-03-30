'use client';

import { useChat, type Message } from 'ai/react';
import { Send, Globe, FileText, Database, X, History } from 'lucide-react';
import { useRef, useEffect, useState, useCallback } from 'react';
import ChatHistoryPanel from '@/components/chat-history-panel';

interface Props {
  initialQuestion?: string;
}

interface DocOption {
  id: string;
  name: string;
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(\[(?:doc|web): [^\]]+\])/g);
  return (
    <span>
      {parts.map((part, i) => {
        const docMatch = part.match(/^\[doc: ([^\]]+)\]$/);
        const webMatch = part.match(/^\[web: ([^\]]+)\]$/);
        if (docMatch) return (
          <span key={i} className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 px-1.5 py-0.5 rounded font-medium mx-0.5">
            <FileText size={10} /> {docMatch[1]}
          </span>
        );
        if (webMatch) return (
          <span key={i} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-1.5 py-0.5 rounded font-medium mx-0.5">
            <Globe size={10} /> {webMatch[1]}
          </span>
        );
        return <span key={i} className="whitespace-pre-wrap">{part}</span>;
      })}
    </span>
  );
}

export default function ChatInterface({ initialQuestion }: Props) {
  // Session state
  const [sessionId, setSessionId]       = useState<string | null>(null);
  const [showHistory, setShowHistory]   = useState(false);

  // @mention state
  const [allDocs, setAllDocs]             = useState<DocOption[]>([]);
  const [mentionedDocs, setMentionedDocs] = useState<DocOption[]>([]);
  const [showPicker, setShowPicker]       = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionStart, setMentionStart]   = useState(-1);
  const [pickerIndex, setPickerIndex]     = useState(0);

  const inputRef  = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentRef   = useRef(false);

  const { messages, input, setInput, setMessages, handleInputChange,
          handleSubmit, isLoading, append } = useChat({
    api: '/api/chat',
    onResponse: (response) => {
      const sid = response.headers.get('X-Session-Id');
      if (sid && !sessionId) setSessionId(sid);
    },
  });

  // Load docs for @mention
  useEffect(() => {
    fetch('/api/documents')
      .then((r) => r.json())
      .then((res) => { const docs = Array.isArray(res) ? res : res?.data ?? []; setAllDocs(docs.map((d: DocOption) => ({ id: d.id, name: d.name }))); })
      .catch(() => {});
  }, []);

  // Auto-send ?q= param
  useEffect(() => {
    if (initialQuestion && !sentRef.current) {
      sentRef.current = true;
      append({ role: 'user', content: initialQuestion });
    }
  }, [initialQuestion, append]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // @mention detection
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange(e);
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const atIdx = textBeforeCursor.lastIndexOf('@');
    if (atIdx !== -1) {
      const afterAt = textBeforeCursor.slice(atIdx + 1);
      if (!afterAt.includes(' ')) {
        setMentionStart(atIdx); setMentionSearch(afterAt.toLowerCase()); setShowPicker(true); setPickerIndex(0); return;
      }
    }
    setShowPicker(false); setMentionStart(-1);
  }, [handleInputChange]);

  function pickDoc(doc: DocOption) {
    const before = input.slice(0, mentionStart);
    const after  = input.slice(mentionStart + 1 + mentionSearch.length);
    setInput(before + after);
    setMentionedDocs((prev) => prev.find((d) => d.id === doc.id) ? prev : [...prev, doc]);
    setShowPicker(false); setMentionStart(-1);
    inputRef.current?.focus();
  }

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredDocs = allDocs
    .filter((d) => d.name.toLowerCase().includes(mentionSearch) && !mentionedDocs.find((m) => m.id === d.id))
    .slice(0, 6);

  function handlePickerKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showPicker || filteredDocs.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPickerIndex((prev) => (prev + 1) % filteredDocs.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPickerIndex((prev) => (prev - 1 + filteredDocs.length) % filteredDocs.length);
    } else if (e.key === 'Enter' && showPicker) {
      e.preventDefault();
      pickDoc(filteredDocs[pickerIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowPicker(false);
      setMentionStart(-1);
    }
  }

  function onSubmit(e: React.FormEvent) {
    const ids = mentionedDocs.map((d) => d.id);
    handleSubmit(e, {
      data: {
        sessionId: sessionId ?? '',
        mentionedDocIds: ids,
      },
    });
    setMentionedDocs([]);
  }

  // Load a past session
  async function loadSession(id: string) {
    try {
      const res  = await fetch(`/api/chat/sessions/${id}`);
      const data = await res.json() as { messages: { id: string; role: string; content: string }[] };
      const msgs: Message[] = data.messages.map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content }));
      setMessages(msgs);
      setSessionId(id);
    } catch { /* ignore */ }
  }

  function startNewChat() {
    setMessages([]);
    setSessionId(null);
    sentRef.current = false;
  }

  return (
    <div className="flex flex-col h-full">
      {/* History panel overlay */}
      {showHistory && (
        <ChatHistoryPanel
          currentSessionId={sessionId}
          onSelectSession={loadSession}
          onNewChat={() => { startNewChat(); setShowHistory(false); }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-2">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-16">
            <p className="text-2xl mb-2">🧠</p>
            <p className="mb-1">Ask anything about your finances,</p>
            <p className="mb-3">documents, taxes, or the web.</p>
            <p className="text-xs bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 inline-block">
              Tip: type <span className="font-mono font-semibold text-sky-600">@</span> to attach a document
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-sky-600 text-white rounded-br-sm whitespace-pre-wrap'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 rounded-bl-sm'
            }`}>
              {m.role === 'user' ? m.content : <MessageContent content={m.content} />}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
        {/* Mentioned doc chips */}
        {mentionedDocs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {mentionedDocs.map((doc) => (
              <span key={doc.id} className="flex items-center gap-1 text-xs bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 px-2 py-1 rounded-full font-medium">
                <FileText size={11} />
                <span className="max-w-[140px] truncate">{doc.name}</span>
                <button onClick={() => setMentionedDocs((p) => p.filter((d) => d.id !== doc.id))} className="hover:text-sky-900 ml-0.5">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Source hints + history button */}
        <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
          <span className="flex items-center gap-1"><Database size={11} /> Live data</span>
          <span className="flex items-center gap-1"><FileText size={11} /> Docs</span>
          <span className="flex items-center gap-1"><Globe size={11} /> Web</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-sky-400 font-medium">@ to attach</span>
            <button onClick={() => setShowHistory(true)} className="flex items-center gap-1 text-gray-400 hover:text-gray-600">
              <History size={13} /> History
            </button>
          </span>
        </div>

        {/* @mention picker */}
        <div className="relative" ref={pickerRef}>
          {showPicker && filteredDocs.length > 0 && (
            <div role="listbox" aria-label="Document mentions" className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-700 rounded-2xl shadow-lg overflow-hidden z-50">
              {filteredDocs.map((doc, idx) => (
                <button
                  key={doc.id}
                  id={`mention-option-${doc.id}`}
                  role="option"
                  aria-selected={idx === pickerIndex}
                  onMouseDown={(e) => { e.preventDefault(); pickDoc(doc); }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-sky-50 dark:hover:bg-sky-950 text-left ${idx === pickerIndex ? 'bg-sky-50 dark:bg-sky-950' : ''}`}
                >
                  <FileText size={14} className="text-sky-400 shrink-0" />
                  <span className="truncate">{doc.name}</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handlePickerKeyDown}
              placeholder={mentionedDocs.length > 0 ? 'Ask about this document…' : 'Ask anything… (@ to attach a doc)'}
              aria-activedescendant={showPicker && filteredDocs.length > 0 ? `mention-option-${filteredDocs[pickerIndex]?.id}` : undefined}
              className="flex-1 border border-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
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
    </div>
  );
}
