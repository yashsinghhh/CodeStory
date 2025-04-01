// app/components/GeminiAnalyzeButton.tsx
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface GeminiAnalyzeButtonProps {
  pageId: string;
}

export default function GeminiAnalyzeButton({ pageId }: GeminiAnalyzeButtonProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyzeClick = async () => {
    try {
      setIsAnalyzing(true);
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
        throw new Error(errorData.error || 'Failed to analyze page');
      }
      
      const data = await response.json();
      console.log('Analysis completed successfully. Check terminal for results.');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error analyzing page:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div>
      <Button
        onClick={handleAnalyzeClick}
        disabled={isAnalyzing}
        className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
      >
        {isAnalyzing ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Analyzing...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Analyze with Gemini
          </>
        )}
      </Button>
      
      {error && (
        <p className="text-red-500 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}