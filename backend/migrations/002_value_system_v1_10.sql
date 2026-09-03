-- 数值系统 v1.10：季节/天气/温度、单一肥力、病虫害、品质与产量、土地金币解锁。
-- 注意：迁移执行器按 ";" 切分语句，因此本文件内不要出现字符串字面量里的分号。
-- 旧存档兼容：作物表整体替换为 v1.10 的 24 种作物，旧作物（wheat/corn/...）不再存在，
-- 已在种植的旧作物会被清空；土地湿度/肥力/土壤健康统一重置为 70。

ALTER TABLE player_states
    ADD COLUMN world_seed VARCHAR(64) NOT NULL DEFAULT '' AFTER version,
    MODIFY COLUMN coins BIGINT NOT NULL DEFAULT 100

ALTER TABLE player_farm_plots
    ADD COLUMN unlocked BOOLEAN NOT NULL DEFAULT FALSE AFTER plot_index,
    ADD COLUMN soil_health DECIMAL(7,3) NOT NULL DEFAULT 70 AFTER fertilizer,
    ADD COLUMN stage TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER soil_health,
    ADD COLUMN stage_growth DECIMAL(7,3) NOT NULL DEFAULT 0 AFTER stage,
    ADD COLUMN plant_age_minutes INT UNSIGNED NOT NULL DEFAULT 0 AFTER stage_growth,
    ADD COLUMN mature BOOLEAN NOT NULL DEFAULT FALSE AFTER harvestable,
    ADD COLUMN pest_level DECIMAL(7,3) NOT NULL DEFAULT 0 AFTER mature,
    ADD COLUMN disease_level DECIMAL(7,3) NOT NULL DEFAULT 0 AFTER pest_level,
    ADD COLUMN pest_status VARCHAR(8) NOT NULL DEFAULT 'NONE' AFTER disease_level,
    ADD COLUMN disease_status VARCHAR(8) NOT NULL DEFAULT 'NONE' AFTER pest_status,
    ADD COLUMN pest_onset_ms BIGINT NULL AFTER disease_status,
    ADD COLUMN disease_onset_ms BIGINT NULL AFTER pest_onset_ms,
    ADD COLUMN active_fertilizers JSON NULL AFTER disease_onset_ms,
    ADD COLUMN active_medicines JSON NULL AFTER active_fertilizers,
    ADD COLUMN quality_score DECIMAL(7,3) NOT NULL DEFAULT 60 AFTER active_medicines,
    ADD COLUMN mature_yield INT UNSIGNED NOT NULL DEFAULT 0 AFTER quality_score,
    ADD COLUMN harvest_quantity INT UNSIGNED NOT NULL DEFAULT 0 AFTER mature_yield,
    ADD COLUMN daily_plant_count TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER harvest_quantity,
    ADD COLUMN daily_net_income DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER daily_plant_count,
    ADD CONSTRAINT chk_plot_soil_health CHECK (soil_health BETWEEN 0 AND 100),
    ADD CONSTRAINT chk_plot_stage CHECK (stage BETWEEN 0 AND 3),
    ADD CONSTRAINT chk_plot_stage_growth CHECK (stage_growth BETWEEN 0 AND 100),
    ADD CONSTRAINT chk_plot_pest_level CHECK (pest_level BETWEEN 0 AND 100),
    ADD CONSTRAINT chk_plot_disease_level CHECK (disease_level BETWEEN 0 AND 100),
    ADD CONSTRAINT chk_plot_quality CHECK (quality_score BETWEEN 0 AND 100)

ALTER TABLE player_farm_plots
    MODIFY COLUMN water DECIMAL(7,3) NOT NULL DEFAULT 70,
    MODIFY COLUMN fertilizer DECIMAL(7,3) NOT NULL DEFAULT 70

-- 旧存档：1 号地（以及此前已开发的地）直接解锁，湿度/肥力/土壤健康重置为 70，旧作物清空。
UPDATE player_farm_plots
    SET unlocked = TRUE,
        water = 70,
        fertilizer = 70,
        soil_health = 70,
        crop_id = NULL,
        stage = 0,
        stage_growth = 0,
        plant_age_minutes = 0,
        mature = FALSE,
        progress = 0,
        harvestable = FALSE,
        quality_score = 60,
        mature_yield = 0,
        harvest_quantity = 0,
        daily_plant_count = 0,
        daily_net_income = 0,
        pest_level = 0,
        disease_level = 0,
        pest_status = 'NONE',
        disease_status = 'NONE',
        pest_onset_ms = NULL,
        disease_onset_ms = NULL,
        active_fertilizers = NULL,
        active_medicines = NULL
    WHERE plot_index = 1 OR developed = TRUE

-- 玩家操作流水（文档第十四章 PlayerAction）
CREATE TABLE IF NOT EXISTS player_actions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    action_type VARCHAR(32) NOT NULL,
    plot_id TINYINT UNSIGNED NULL,
    crop_id VARCHAR(64) NULL,
    fertilizer_id VARCHAR(64) NULL,
    medicine_id VARCHAR(64) NULL,
    cost INT NOT NULL DEFAULT 0,
    income INT NOT NULL DEFAULT 0,
    day_index INT NOT NULL DEFAULT 0,
    created_at_ms BIGINT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_player_actions_user_day (user_id, day_index),
    CONSTRAINT fk_player_action_account FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

-- 每日经济统计（文档第十四章 DailyEconomy），按天保留历史
CREATE TABLE IF NOT EXISTS player_daily_economy (
    user_id BIGINT UNSIGNED NOT NULL,
    day_index INT NOT NULL,
    seed_cost INT NOT NULL DEFAULT 0,
    fertilizer_cost INT NOT NULL DEFAULT 0,
    medicine_cost INT NOT NULL DEFAULT 0,
    land_unlock_cost INT NOT NULL DEFAULT 0,
    gross_income INT NOT NULL DEFAULT 0,
    plant_count INT NOT NULL DEFAULT 0,
    harvest_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, day_index),
    CONSTRAINT fk_daily_economy_account FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
