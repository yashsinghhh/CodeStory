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
}

export default function NotionPages() {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

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

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-700">
        Loading pages...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 font-semibold">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-black">Notion Pages</h1>
        <button 
          onClick={handleManualFetch}
          disabled={isFetching}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isFetching ? 'Fetching...' : 'Fetch Pages'}
        </button>
      </div>

      {pages.length === 0 ? (
        <div className="text-center text-gray-600">
          No pages found. Try fetching pages manually.
        </div>
      ) : (
        <div className="space-y-6">
          {pages.map((page) => (
            <div
              key={page.id}
              className="bg-white shadow-md rounded-lg p-6 hover:shadow-lg transition-shadow border border-gray-200"
            >
              <div className="flex justify-between items-start">
                <div>
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
                    <p className="text-gray-800 mb-4 font-medium">
                      {page.Description}
                    </p>
                  )}
                </div>
                
                {/* Action Buttons */}
                <div className="flex space-x-2">
                  {/* Read Post Button */}
                  <Link
                    href={`/notion/${page.id}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline font-semibold px-4 py-2 rounded-md border border-blue-600 hover:border-blue-800 transition-colors"
                  >
                    Read Post
                  </Link>
                  
                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeletePage(page.id)}
                    disabled={isDeleting === page.id}
                    className="text-red-600 hover:text-red-800 hover:bg-red-50 font-semibold px-4 py-2 rounded-md border border-red-600 hover:border-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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