'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function CaptureModal() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setText('');
        setTags('');
        setDone(false);
      }, 800);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Quick capture"
        className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full bg-sky-600 text-white shadow-lg flex items-center justify-center hover:bg-sky-700 active:scale-95 transition-transform"
      >
        <Plus size={28} />
      </button>

      {/* Bottom sheet */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setOpen(false)}>
          <div
            className="w-full bg-white rounded-t-2xl shadow-2xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Quick Capture</h2>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What's on your mind? Paste a URL, jot a note, paste text..."
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-36 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Tags (comma separated, optional)"
                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="submit"
                disabled={saving || !text.trim()}
                className="w-full bg-sky-600 text-white rounded-xl py-3 font-medium disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {done ? 'Saved!' : saving ? 'Saving...' : 'Save to Brain'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
