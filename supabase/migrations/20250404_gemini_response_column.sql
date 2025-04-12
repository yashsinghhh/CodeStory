-- Add gemini_analysis column to pages table
ALTER TABLE pages ADD COLUMN gemini_analysis TEXT;

-- Add gemini_analyzed_at timestamp column to track when analysis was performed
ALTER TABLE pages ADD COLUMN gemini_analyzed_at TIMESTAMPTZ;