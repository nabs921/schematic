-- Repair legacy/invalid membership roles before enforcing valid values.
-- An empty role previously caused shared files/folders to redirect viewers
-- away as if they had no access at all.

UPDATE file_members
SET role = 'viewer'
WHERE role NOT IN ('editor', 'viewer');

UPDATE folder_members
SET role = 'viewer'
WHERE role NOT IN ('editor', 'viewer');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'file_members_role_check'
  ) THEN
    ALTER TABLE file_members
      ADD CONSTRAINT file_members_role_check CHECK (role IN ('editor', 'viewer'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'folder_members_role_check'
  ) THEN
    ALTER TABLE folder_members
      ADD CONSTRAINT folder_members_role_check CHECK (role IN ('editor', 'viewer'));
  END IF;
END $$;
