-- Notification support: track who shared a resource and when the recipient
-- last opened their notification feed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notifications_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE file_members
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE folder_members
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;
