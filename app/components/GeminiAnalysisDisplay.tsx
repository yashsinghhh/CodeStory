// app/components/GeminiAnalysisDisplay.tsx
"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface GeminiAnalysisDisplayProps {
  pageId: string;
  initialAnalysis?: {
    result: string;
    analyzedAt: string;
  };
}

export default function GeminiAnalysisDisplay({ 
  pageId, 
  initialAnalysis 
}: GeminiAnalysisDisplayProps) {
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(!!initialAnalysis);

  const fetchAnalysis = async () => {
    if (!pageId) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pageId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch analysis');
      }
      
      const data = await response.json();
      setAnalysis({
        result: data.result,
        analyzedAt: data.analyzedAt
      });
      setIsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialAnalysis) {
      setAnalysis(initialAnalysis);
    }
  }, [initialAnalysis]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      year: 'numeric'
    }).format(date);
  };

  if (!isOpen) {
    return (
      <div className="my-6">
        <Button
          onClick={fetchAnalysis}
          disabled={isLoading}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading Analysis...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              View Gemini Analysis
            </>
          )}
        </Button>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <Card className="my-6 bg-white border-emerald-100 shadow-md overflow-hidden transition-all duration-300 animate-fade-in-up">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
        <div className="flex justify-between items-center">
          <CardTitle className="text-emerald-700 text-lg">Gemini Analysis</CardTitle>
          <div className="flex items-center space-x-4">
            <div className="text-xs text-gray-500">
              Generated: {formatDate(analysis?.analyzedAt)}
            </div>
            <Button 
              onClick={() => setIsOpen(false)} 
              variant="outline" 
              size="sm"
              className="border-gray-300 hover:bg-gray-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {analysis?.result ? (
          <div className="prose max-w-none">
            {analysis.result.split('\n').map((paragraph, index) => (
              paragraph.trim() ? (
                <p key={index} className="mb-4 last:mb-0 text-gray-700">
                  {paragraph}
                </p>
              ) : null
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic">No analysis available</p>
        )}
      </CardContent>
    </Card>
  );
}