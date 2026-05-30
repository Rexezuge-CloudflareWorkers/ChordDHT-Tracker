-- v3.0: store configured successor list capacity separately from current list size
ALTER TABLE nodes ADD COLUMN successor_list_capacity INTEGER;
