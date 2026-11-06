-- Cleanup: Remove notes from canvas_data JSONB after successful migration
-- This removes the notes array from the JSONB column since they're now in the canvas_notes table

DO $$
DECLARE
    cleanup_count INTEGER;
BEGIN
    UPDATE files
    SET canvas_data = canvas_data - 'notes'
    WHERE canvas_data ? 'notes';

    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned up notes from % files', cleanup_count;
END $$;
