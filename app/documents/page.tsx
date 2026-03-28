'use client';

import { useState } from 'react';
import DocumentUploader from '@/components/document-uploader';
import DocumentList from '@/components/document-list';

export default function DocumentsPage() {
  const [refresh, setRefresh] = useState(0);

  return (
    <div className="p-4 pt-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Knowledge Base</h1>
        <p className="text-sm text-gray-500">Upload documents to make them searchable</p>
      </div>
      <DocumentUploader onUploaded={() => setRefresh((n) => n + 1)} />
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Your Documents</h2>
        <DocumentList refresh={refresh} />
      </div>
    </div>
  );
}
