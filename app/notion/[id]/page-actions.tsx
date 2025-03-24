"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PageActionsProps {
  pageId: string;
  notionUrl: string;
  lastSyncedAt?: string;
  notionLastEditedAt?: string;
}

export default function PageActions({ 
  pageId, 
  notionUrl, 
  lastSyncedAt, 
  notionLastEditedAt 
}: PageActionsProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this page? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(true);
      const response = await fetch(`/api/notion/${pageId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete page');
      }

      // Redirect to home page after successful deletion
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete page');
      setIsDeleting(false);
    }
  };

  return (
    <div className="mt-12 flex justify-center space-x-4 animate-fade-in-up delay-500">
      {error && (
        <div className="text-red-600 mb-4 font-medium">{error}</div>
      )}
      
      {/* External Notion Link */}
      <a
        href={notionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors group px-4 py-2 border border-blue-600 rounded-md"
      >
        <span>View in Notion</span>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-4 w-4 group-hover:translate-x-1 transition-transform" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </a>
      
      {/* Delete Button */}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center space-x-2 text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors px-4 py-2 border border-red-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{isDeleting ? 'Deleting...' : 'Delete Page'}</span>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-4 w-4" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}