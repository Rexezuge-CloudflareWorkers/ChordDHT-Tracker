-- v3.0 ring topology data: full successor/predecessor lists, RTT samples, finger nodes
ALTER TABLE nodes ADD COLUMN successor_list TEXT;
ALTER TABLE nodes ADD COLUMN predecessor_list TEXT;
ALTER TABLE nodes ADD COLUMN rtt_samples TEXT;
ALTER TABLE nodes ADD COLUMN finger_nodes TEXT;
