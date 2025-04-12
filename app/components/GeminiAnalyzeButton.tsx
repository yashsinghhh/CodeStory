// app/components/GeminiAnalyzeButton.tsx
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GeminiAnalyzeButtonProps {
  pageId: string;
}

interface AnalysisResult {
  success: boolean;
  pageTitle: string;
  result: string;
  analyzedAt: string;
  cached: boolean;
}

export default function GeminiAnalyzeButton({ pageId }: GeminiAnalyzeButtonProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const handleAnalyzeClick = async (forceRefresh = false) => {
    try {
      setIsAnalyzing(true);
      setError(null);
      
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pageId, forceRefresh }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze page');
      }
      
      const data = await response.json();
      console.log('Analysis completed successfully');
      
      setAnalysisResult(data);
      setShowAnalysis(true);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error analyzing page:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatDate = (dateString: string) => {
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

  return (
    <div className="w-full">
      <div className="flex flex-col space-y-4">
        <div className="flex space-x-2">
          <Button
            onClick={() => handleAnalyzeClick(false)}
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
          
          {analysisResult && (
            <Button
              onClick={() => handleAnalyzeClick(true)}
              disabled={isAnalyzing}
              variant="outline"
              className="border-teal-600 text-teal-700 hover:bg-teal-50"
            >
              Regenerate Analysis
            </Button>
          )}
        </div>
        
        {error && (
          <p className="text-red-500 text-sm mt-2">{error}</p>
        )}
        
        {showAnalysis && analysisResult && (
          <Card className="bg-white border-emerald-100 shadow-md overflow-hidden transition-all duration-300 animate-fade-in-up">
            <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
              <div className="flex justify-between items-center">
                <CardTitle className="text-emerald-700 text-lg">Gemini Analysis</CardTitle>
                <div className="text-xs text-gray-500">
                  {analysisResult.cached ? 'From cache - ' : ''}
                  Generated: {formatDate(analysisResult.analyzedAt)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="prose max-w-none">
                {analysisResult.result.split('\n').map((paragraph, index) => (
                  paragraph.trim() ? (
                    <p key={index} className="mb-4 last:mb-0 text-gray-700">
                      {paragraph}
                    </p>
                  ) : null
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}