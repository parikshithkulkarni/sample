'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, Trash2, Plus, X, Clock } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface Props {
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ChatHistoryPanel({ currentSessionId, onSelectSession, onNewChat, onClose }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/chat/sessions')
      .then((r) => r.json())
      .then((data) => { setSessions(Array.isArray(data) ? data : data?.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function deleteSession(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === currentSessionId) onNewChat();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900">Chat History</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewChat}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-sky-600 text-white rounded-xl font-medium"
          >
            <Plus size={13} /> New Chat
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="text-center text-gray-400 text-sm py-10 animate-pulse">Loading…</p>
        )}
        {!loading && sessions.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-16">
            <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
            <p>No conversations yet.</p>
            <p className="text-xs mt-1">Start a new chat to get going.</p>
          </div>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => { onSelectSession(s.id); onClose(); }}
            className={`w-full flex items-start justify-between px-4 py-3.5 border-b border-gray-50 text-left hover:bg-gray-50 transition-colors ${
              s.id === currentSessionId ? 'bg-sky-50 border-l-2 border-l-sky-500' : ''
            }`}
          >
            <div className="flex-1 min-w-0 mr-2">
              <p className="text-sm font-medium text-gray-800 truncate">{s.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {s.message_count} message{s.message_count !== 1 ? 's' : ''} · {timeAgo(s.updated_at)}
              </p>
            </div>
            <button
              onClick={(e) => deleteSession(e, s.id)}
              className="shrink-0 p-1 text-gray-300 hover:text-red-400 mt-0.5"
            >
              <Trash2 size={14} />
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}
