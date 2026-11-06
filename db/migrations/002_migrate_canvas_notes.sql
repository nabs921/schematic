-- Migration: Move canvas notes from JSONB to dedicated table
-- This script migrates existing notes stored in files.canvas_data to the canvas_notes table
-- Note: Old string IDs (like "note-1234567890") will be replaced with new UUIDs

-- First, check if there are any notes to migrate
DO $$
DECLARE
    note_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO note_count
    FROM files
    WHERE canvas_data IS NOT NULL
    AND canvas_data != '{}'::jsonb
    AND (canvas_data->'notes') IS NOT NULL
    AND jsonb_array_length(canvas_data->'notes') > 0;

    IF note_count > 0 THEN
        RAISE NOTICE 'Found % files with notes to migrate', note_count;
    ELSE
        RAISE NOTICE 'No notes found to migrate';
    END IF;
END $$;

-- Migrate notes from canvas_data JSONB to canvas_notes table
-- Generate new UUIDs for each note since old IDs are strings, not UUIDs
INSERT INTO canvas_notes (id, file_id, title, content, color, position_x, position_y, width, height, created_at, updated_at)
SELECT
    gen_random_uuid() as id,
    f.id as file_id,
    COALESCE(note_data->>'title', 'Note') as title,
    COALESCE(note_data->>'content', '') as content,
    COALESCE(note_data->>'color', '#fef08a') as color,
    COALESCE((note_data->'position'->>'x')::numeric, 100) as position_x,
    COALESCE((note_data->'position'->>'y')::numeric, 100) as position_y,
    COALESCE((note_data->>'width')::numeric, 220) as width,
    COALESCE((note_data->>'height')::numeric, 160) as height,
    COALESCE((note_data->>'created_at')::timestamp with time zone, CURRENT_TIMESTAMP) as created_at,
    COALESCE((note_data->>'updated_at')::timestamp with time zone, CURRENT_TIMESTAMP) as updated_at
FROM files f,
     jsonb_array_elements(f.canvas_data->'notes') as note_data
WHERE f.canvas_data IS NOT NULL
AND f.canvas_data != '{}'::jsonb
AND (f.canvas_data->'notes') IS NOT NULL
AND jsonb_array_length(f.canvas_data->'notes') > 0;

-- Report migration results
DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM canvas_notes;
    RAISE NOTICE 'Total notes in canvas_notes table after migration: %', migrated_count;
END $$;

-- Clean up: Remove notes from canvas_data JSONB (optional - keep as backup)
-- Uncomment the line below if you want to remove notes from JSONB after successful migration
-- UPDATE files SET canvas_data = canvas_data - 'notes' WHERE canvas_data ? 'notes';
