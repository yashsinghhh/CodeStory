-- Add plain_text column to existing pages table
ALTER TABLE pages ADD COLUMN plain_text TEXT;

-- Add an index for potential text search
CREATE INDEX idx_pages_plain_text_search ON pages USING GIN (to_tsvector('english', plain_text));