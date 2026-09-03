CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    wx_openid VARCHAR(64) NULL,
    username VARCHAR(32) NULL,
    password_hash VARCHAR(255) NULL,
    display_name VARCHAR(64) NULL,
    region VARCHAR(64) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_accounts_wx_openid (wx_openid),
    UNIQUE KEY uq_accounts_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_states (
    user_id BIGINT UNSIGNED NOT NULL,
    coins BIGINT NOT NULL DEFAULT 500,
    diamonds BIGINT NOT NULL DEFAULT 0,
    level INT NOT NULL DEFAULT 1,
    exp BIGINT NOT NULL DEFAULT 0,
    energy INT NOT NULL DEFAULT 100,
    version BIGINT UNSIGNED NOT NULL DEFAULT 1,
    last_simulated_at_ms BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id),
    CONSTRAINT fk_game_state_account FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
    CONSTRAINT chk_player_non_negative CHECK (coins >= 0 AND diamonds >= 0 AND exp >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_farm_plots (
    user_id BIGINT UNSIGNED NOT NULL,
    plot_index TINYINT UNSIGNED NOT NULL,
    developed BOOLEAN NOT NULL DEFAULT FALSE,
    water DECIMAL(7,3) NOT NULL DEFAULT 0,
    fertilizer DECIMAL(7,3) NOT NULL DEFAULT 0,
    crop_id VARCHAR(64) NULL,
    planted_at_ms BIGINT NOT NULL DEFAULT 0,
    progress DECIMAL(9,6) NOT NULL DEFAULT 0,
    harvestable BOOLEAN NOT NULL DEFAULT FALSE,
    last_boost_key VARCHAR(16) NOT NULL DEFAULT '',
    last_watered_at_ms BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, plot_index),
    CONSTRAINT fk_game_plot_account FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
    CONSTRAINT chk_plot_index CHECK (plot_index BETWEEN 1 AND 24),
    CONSTRAINT chk_plot_water CHECK (water BETWEEN 0 AND 100),
    CONSTRAINT chk_plot_fertilizer CHECK (fertilizer BETWEEN 0 AND 100),
    CONSTRAINT chk_plot_progress CHECK (progress BETWEEN 0 AND 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_items (
    user_id BIGINT UNSIGNED NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    count INT UNSIGNED NOT NULL,
    acquired_at_ms BIGINT NOT NULL,
    PRIMARY KEY (user_id, item_id),
    CONSTRAINT fk_game_item_account FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
    CONSTRAINT chk_inventory_count CHECK (count > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS processed_commands (
    user_id BIGINT UNSIGNED NOT NULL,
    command_id VARCHAR(64) NOT NULL,
    response_json JSON NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, command_id),
    KEY idx_processed_commands_created (created_at),
    CONSTRAINT fk_game_command_account FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
