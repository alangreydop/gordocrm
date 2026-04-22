ALTER TABLE `assets` ADD COLUMN `client_id` text REFERENCES `clients`(`id`);
UPDATE `assets` SET `client_id` = (SELECT `client_id` FROM `jobs` WHERE `jobs`.`id` = `assets`.`job_id`) WHERE `client_id` IS NULL;
CREATE INDEX `idx_assets_client_id` ON `assets` (`client_id`);
