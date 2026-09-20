ALTER TABLE player_farm_plots ADD COLUMN grass_level DECIMAL(7,3) NOT NULL DEFAULT 0;
ALTER TABLE player_farm_plots ADD COLUMN grass_status VARCHAR(8) NOT NULL DEFAULT 'NONE';
ALTER TABLE player_farm_plots ADD COLUMN grass_onset_ms BIGINT NULL
