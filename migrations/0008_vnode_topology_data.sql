-- v4.0: store ring topology reported by virtual nodes.
ALTER TABLE vnodes ADD COLUMN joined_at INTEGER;
ALTER TABLE vnodes ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vnodes ADD COLUMN successor_id TEXT;
ALTER TABLE vnodes ADD COLUMN predecessor_id TEXT;
ALTER TABLE vnodes ADD COLUMN successor_list_size INTEGER;
ALTER TABLE vnodes ADD COLUMN successor_list_capacity INTEGER;
ALTER TABLE vnodes ADD COLUMN finger_table_coverage REAL;
ALTER TABLE vnodes ADD COLUMN uptime_seconds INTEGER;
ALTER TABLE vnodes ADD COLUMN maintenance_cycles INTEGER;
ALTER TABLE vnodes ADD COLUMN maintenance_mode TEXT;
ALTER TABLE vnodes ADD COLUMN cache_hits INTEGER;
ALTER TABLE vnodes ADD COLUMN cache_misses INTEGER;
ALTER TABLE vnodes ADD COLUMN cache_size INTEGER;
ALTER TABLE vnodes ADD COLUMN predecessor_list_size INTEGER;
ALTER TABLE vnodes ADD COLUMN successor_list TEXT;
ALTER TABLE vnodes ADD COLUMN predecessor_list TEXT;
ALTER TABLE vnodes ADD COLUMN rtt_samples TEXT;
ALTER TABLE vnodes ADD COLUMN finger_nodes TEXT;

UPDATE vnodes SET joined_at = last_seen WHERE joined_at IS NULL;
