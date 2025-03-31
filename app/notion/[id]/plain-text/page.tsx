// app/notion/[id]/plain-text/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NotionPlainTextViewer() {
  const params = useParams();
  const router = useRouter();
  const pageId = params.id as string;
  
  const [plainText, setPlainText] = useState<string>('');
  const [pageTitle, setPageTitle] = useState<string>('');
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlainText() {
      if (!pageId) return;
      
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch(`/api/notion/plain-text/${pageId}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch plain text');
        }
        
        const data = await response.json();
        
        setPageTitle(data.pageTitle);
        setPlainText(data.plainText);
        setStats(data.stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchPlainText();
  }, [pageId]);

  // Function to prepare plain text for LLM
  const prepareForLLM = () => {
    const prompt = `
The following text is from a technical document titled "${pageTitle}". 
Please transform this technical content into an engaging, personalized audio story 
where the listener is the protagonist. Make it conversational, easy to understand,
and maintain all the important technical information.

===== DOCUMENT TEXT =====
${plainText}
`;
    return prompt;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Navigation */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/75 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <Link 
            href={`/notion/${pageId}`} 
            className="text-blue-600 hover:text-blue-800 transition-colors flex items-center space-x-2 group"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5 group-hover:-translate-x-1 transition-transform" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Page</span>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-24 max-w-4xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{pageTitle || 'Plain Text View'}</h1>
          <p className="text-gray-600">View content as it would be sent to the LLM</p>
        </header>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <p>Error: {error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Panel */}
            {stats && (
              <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-2">Content Statistics</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-3 rounded-md">
                    <p className="text-sm text-gray-500">Characters</p>
                    <p className="text-xl font-medium text-blue-700">{stats.characters.toLocaleString()}</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-md">
                    <p className="text-sm text-gray-500">Words</p>
                    <p className="text-xl font-medium text-green-700">{stats.words.toLocaleString()}</p>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-md">
                    <p className="text-sm text-gray-500">Approximate Tokens</p>
                    <p className="text-xl font-medium text-purple-700">{stats.approximateTokens.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Sample LLM Prompt */}
            <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Sample LLM Prompt</h2>
              <p className="text-sm text-gray-600 mb-4">
                This is how the document could be formatted as a prompt for the LLM:
              </p>
              <pre className="bg-white p-4 rounded-md text-sm overflow-auto max-h-40 text-gray-700 border border-gray-200">
                {prepareForLLM()}
              </pre>
            </div>

            {/* Plain Text View */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h2 className="font-medium text-gray-700">Extracted Plain Text</h2>
              </div>
              <pre className="p-6 text-gray-800 whitespace-pre-wrap font-mono text-sm overflow-auto max-h-[600px]">
                {plainText}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}