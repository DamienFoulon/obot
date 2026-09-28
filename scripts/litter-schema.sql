-- Members in the litter, with what to give back at release
CREATE TABLE IF NOT EXISTS litter_members (
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  roles JSON NOT NULL,          -- ids of the roles removed
  nick VARCHAR(32) NULL,        -- original nickname, NULL when the member had none
  since TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id)
) DEFAULT CHARSET = utf8mb4;
