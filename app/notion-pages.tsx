// app/notion-pages.tsx
"use client";
import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { 
  Card, 
  CardContent, 
  CardFooter, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

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
  const [searchQuery, setSearchQuery] = useState('');

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

  // Filter pages based on search query
  const filteredPages = pages.filter(page => {
    const title = page.pageTitle || '';
    const description = page.Description || '';
    const author = page.author?.[0]?.name || '';
    
    return (
      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      author.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center bg-black">
        <div className="w-16 h-16 relative">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 animate-pulse"></div>
          <div className="absolute inset-1 rounded-full bg-black"></div>
          <div className="absolute inset-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
        </div>
        <p className="mt-4 text-zinc-400 font-medium">Loading your knowledge...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 bg-black">
        <div className="w-16 h-16 rounded-full bg-red-900/20 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Something went wrong</h3>
        <p className="text-zinc-400 mb-6 text-center max-w-md">{error}</p>
        <Button 
          onClick={() => fetchNotionPages()}
          variant="default"
          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-black min-h-screen pb-20 relative overflow-hidden">
      {/* Gradient background effects */}
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full mix-blend-screen filter blur-3xl opacity-50 animate-blob"></div>
      <div className="absolute top-40 right-1/3 w-96 h-96 bg-indigo-500/20 rounded-full mix-blend-screen filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-20 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full mix-blend-screen filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
      
      {/* Header Section */}
      <div className="relative z-10 pt-10 pb-12 px-4 mb-10">
        <div className="max-w-6xl mx-auto">
          <div className="relative z-10">
            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500 mb-4">
              Your Notion Pages
            </h1>
            <p className="text-lg text-zinc-400 max-w-2xl">
              Get ready-to-use answers from all your knowledge and quit manual organization for good.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 relative z-10">
        {/* Search and Actions Bar */}
        <div className="flex flex-col lg:flex-row justify-between items-center mb-8 gap-4">
          {/* Search Box */}
          <div className="w-full lg:w-auto relative">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pages..."
              className="w-full lg:w-80 pl-10 pr-4 py-3 bg-zinc-900/80 border-zinc-800 text-zinc-300 placeholder:text-zinc-500 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="flex space-x-3 w-full lg:w-auto">
            {/* Sync with Notion button */}
            <Button
              onClick={handleSyncFromNotion}
              disabled={isSyncing}
              variant="outline"
              className="flex-1 lg:flex-none border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              {isSyncing ? (
                <>
                  <div className="animate-spin h-4 w-4 mr-2" role="status">
                    <svg className="h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Sync from Notion</span>
                </>
              )}
            </Button>
            
            {/* Refresh cache button */}
            <Button
              onClick={handleManualFetch}
              disabled={isFetching}
              className="flex-1 lg:flex-none bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
            >
              {isFetching ? (
                <>
                  <div className="animate-spin h-4 w-4 mr-2 text-white" role="status">
                    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <span>Refreshing...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh Cache</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Content Area */}
        {filteredPages.length === 0 && searchQuery && (
          <Card className="bg-zinc-900/80 border-zinc-800 text-white shadow-xl">
            <CardContent className="flex flex-col items-center justify-center pt-10 pb-8">
              <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <CardTitle className="text-xl font-bold text-white mb-2">No results found</CardTitle>
              <CardDescription className="text-zinc-400 text-center max-w-md mb-4">
                No pages match your search query. Try different keywords or clear the search.
              </CardDescription>
              <Button 
                onClick={() => setSearchQuery('')}
                variant="outline"
                className="border-zinc-700 text-indigo-400 hover:bg-zinc-800"
              >
                Clear Search
              </Button>
            </CardContent>
          </Card>
        )}

        {filteredPages.length === 0 && !searchQuery && (
          <Card className="bg-zinc-900/80 border-zinc-800 text-white shadow-xl">
            <CardContent className="flex flex-col items-center justify-center pt-10 pb-8">
              <div className="w-24 h-24 bg-zinc-800/50 rounded-full flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <CardTitle className="text-2xl font-bold text-white mb-3">No pages found</CardTitle>
              <CardDescription className="text-zinc-400 mb-8 max-w-md text-center">
                Start by syncing your Notion pages to get your knowledge organized in one place.
              </CardDescription>
              <Button 
                onClick={handleSyncFromNotion}
                disabled={isSyncing}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
              >
                {isSyncing ? (
                  <>
                    <div className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" role="status">
                      <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync from Notion
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {filteredPages.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPages.map((page) => (
              <Card 
                key={page.id}
                className="group bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden animate-fade-in-up"
              >
                <CardHeader className="pb-2 border-b border-zinc-800/50">
                  <div className="flex items-start space-x-3 mb-2">
                    {/* Author Avatar */}
                    {page.author && page.author.length > 0 ? (
                      <Avatar className="h-10 w-10 border-2 border-zinc-800">
                        <AvatarImage 
                          src={page.author[0].avatar_url} 
                          alt={page.author[0].name} 
                        />
                        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                          {page.author[0].name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <Avatar className="h-10 w-10 border-2 border-zinc-800">
                        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                          ?
                        </AvatarFallback>
                      </Avatar>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-300 truncate">
                        {page.author?.[0]?.name || 'Unknown'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {page.Date || 'No date'}
                      </p>
                    </div>
                  </div>
                  
                  <CardTitle className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-2">
                    {page.pageTitle || 'Untitled Page'}
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="py-3 flex-grow">
                  {page.Description && (
                    <p className="text-sm text-zinc-400 line-clamp-3 mb-2">
                      {page.Description}
                    </p>
                  )}
                </CardContent>
                
                <CardFooter className="flex flex-col space-y-3 border-t border-zinc-800/50 pt-3 bg-zinc-800/30">
                  <div className="flex text-xs text-zinc-500 w-full justify-between">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Synced: {formatSyncTime(page.last_synced_at)}</span>
                    </div>
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span>Edited: {formatSyncTime(page.notion_last_edited_at)}</span>
                    </div>
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex space-x-2 w-full">
                    <Button
                      asChild
                      className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
                    >
                      <Link href={`/notion/${page.id}`}>
                        View Page
                      </Link>
                    </Button>
                    
                    <Button
                      asChild
                      variant="outline" 
                      className="border-zinc-700 hover:bg-zinc-800"
                    >
                      <Link href={`/notion/${page.id}?sync=true`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </Link>
                    </Button>
                    
                    <Button
                      onClick={() => handleDeletePage(page.id)}
                      disabled={isDeleting === page.id}
                      variant="outline"
                      className="border-zinc-700 hover:bg-zinc-800 hover:text-red-400 text-red-500"
                    >
                      {isDeleting === page.id ? (
                        <div className="animate-spin h-4 w-4" role="status">
                          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}