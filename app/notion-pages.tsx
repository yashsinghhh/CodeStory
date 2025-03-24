// app/notion-pages.tsx
"use client";
import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export interface NotionPage {
  id: string;
  url: string;
  pageTitle: string;
  Description: string;
  author: Array<{
    id: string;
    name: string;
    avatar_url: string;
  }>;
  Date: string;
  last_synced_at?: string;
  notion_last_edited_at?: string;
}

export default function NotionPages() {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetchNotionPages();
  }, []);

  async function fetchNotionPages(forceUpdate: boolean = false) {
    try {
      setIsLoading(true);
      setError(null);
      
      // Determine the fetch URL based on force update
      const url = forceUpdate 
        ? '/api/notion?force_update=true' 
        : '/api/notion';

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch Notion pages');
      }
      
      const data = await response.json();
      setPages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }

  async function handleManualFetch() {
    setIsFetching(true);
    await fetchNotionPages(true);
  }
  
  async function handleSyncFromNotion() {
    try {
      setIsSyncing(true);
      setError(null);
      
      // Call the API with sync parameter
      const response = await fetch('/api/notion?sync=true');
      
      if (!response.ok) {
        throw new Error('Failed to sync pages from Notion');
      }
      
      // Fetch updated pages after sync
      const data = await response.json();
      setPages(data);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync with Notion');
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDeletePage(pageId: string) {
    if (!confirm('Are you sure you want to delete this page? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(pageId);
      const response = await fetch(`/api/notion/${pageId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete page');
      }

      // Remove the deleted page from the state
      setPages(pages.filter(page => page.id !== pageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete page');
    } finally {
      setIsDeleting(null);
    }
  }
  
  function formatSyncTime(timestamp: string | undefined): string {
    if (!timestamp) return 'Never';
    
    try {
      const date = new Date(timestamp);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch (e) {
      return 'Invalid date';
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-700">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent text-blue-600 rounded-full mr-2" role="status" aria-label="loading"></div>
        Loading pages...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 font-semibold">
        <div className="flex items-center mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Error: {error}
        </div>
        <button 
          onClick={() => fetchNotionPages()}
          className="text-blue-600 hover:text-blue-800 underline"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-black">Notion Pages</h1>
        <div className="flex space-x-3">
          {/* Sync with Notion button */}
          <button 
            onClick={handleSyncFromNotion}
            disabled={isSyncing}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center"
          >
            {isSyncing ? (
              <>
                <div className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" role="status">
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                Syncing...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync from Notion
              </>
            )}
          </button>
          
          {/* Refresh cache button */}
          <button 
            onClick={handleManualFetch}
            disabled={isFetching}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isFetching ? 'Refreshing...' : 'Refresh Cache'}
          </button>
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="text-center text-gray-600 bg-gray-50 p-8 rounded-lg border border-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-lg mb-3">No pages found</p>
          <p className="text-sm mb-4">Try syncing from Notion to load your pages</p>
          <button 
            onClick={handleSyncFromNotion}
            disabled={isSyncing}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {isSyncing ? 'Syncing...' : 'Sync from Notion'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {pages.map((page) => (
            <div
              key={page.id}
              className="bg-white shadow-md rounded-lg p-6 hover:shadow-lg transition-shadow border border-gray-200"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {/* Page Title and Author */}
                  <div className="flex items-center mb-4">
                    {/* Author Avatar */}
                    {page.author && page.author.length > 0 && (
                      <div className="mr-4">
                        <Image
                          src={page.author[0].avatar_url}
                          alt={page.author[0].name}
                          width={48}
                          height={48}
                          className="rounded-full object-cover"
                          style={{
                            aspectRatio: '1/1',
                            objectFit: 'cover'
                          }}
                        />
                      </div>
                    )}
                    
                    {/* Page Title */}
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">
                        {page.pageTitle || 'Untitled Page'}
                      </h2>
                      <p className="text-gray-600 text-sm">
                        Created by {page.author?.[0]?.name || 'Unknown'}
                        {page.Date && ` on ${page.Date}`}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  {page.Description && (
                    <p className="text-gray-800 mb-3 font-medium">
                      {page.Description}
                    </p>
                  )}
                  
                  {/* Sync Status */}
                  <div className="flex items-center text-xs text-gray-500 mt-2">
                    <span className="mr-4">
                      <span className="font-medium">Last synced:</span> {formatSyncTime(page.last_synced_at)}
                    </span>
                    <span>
                      <span className="font-medium">Last edited in Notion:</span> {formatSyncTime(page.notion_last_edited_at)}
                    </span>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex flex-col space-y-2 ml-4">
                  {/* Read Post Button */}
                  <Link
                    href={`/notion/${page.id}`}
                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-semibold px-4 py-2 rounded-md border border-blue-600 hover:border-blue-800 transition-colors text-center"
                  >
                    Read Post
                  </Link>
                  
                  {/* Sync Button */}
                  <Link
                    href={`/notion/${page.id}?sync=true`}
                    className="text-green-600 hover:text-green-800 hover:bg-green-50 font-semibold px-4 py-2 rounded-md border border-green-600 hover:border-green-800 transition-colors text-center text-sm"
                  >
                    Sync Page
                  </Link>
                  
                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeletePage(page.id)}
                    disabled={isDeleting === page.id}
                    className="text-red-600 hover:text-red-800 hover:bg-red-50 font-semibold px-4 py-2 rounded-md border border-red-600 hover:border-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isDeleting === page.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}