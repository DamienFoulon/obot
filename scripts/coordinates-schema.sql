-- Minecraft coordinates, one world per post of the coordinates forum (thread_id)
-- The case-insensitive collation makes the unique key refuse "Base" when "base" exists
CREATE TABLE IF NOT EXISTS coordinates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  thread_id VARCHAR(32) NOT NULL,
  name VARCHAR(50) NOT NULL,
  dimension ENUM('overworld', 'nether', 'end') NOT NULL DEFAULT 'overworld',
  x INT NOT NULL,
  y INT NOT NULL,
  z INT NOT NULL,
  note VARCHAR(200) NULL,
  created_by VARCHAR(32) NOT NULL,
  updated_by VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY coordinates_thread_name (thread_id, name),
  KEY coordinates_thread (thread_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- The panel message of each world
CREATE TABLE IF NOT EXISTS coordinate_panels (
  thread_id VARCHAR(32) PRIMARY KEY,
  message_id VARCHAR(32) NOT NULL
) DEFAULT CHARSET = utf8mb4;
