-- v3.0: adaptive maintenance mode, routing cache stats, predecessor list size
ALTER TABLE nodes ADD COLUMN maintenance_mode TEXT;
ALTER TABLE nodes ADD COLUMN cache_hits INTEGER;
ALTER TABLE nodes ADD COLUMN cache_misses INTEGER;
ALTER TABLE nodes ADD COLUMN cache_size INTEGER;
ALTER TABLE nodes ADD COLUMN predecessor_list_size INTEGER;
