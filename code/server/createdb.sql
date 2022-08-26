DROP DATABASE IF EXISTS `frs_jwt`;
CREATE DATABASE `frs_jwt`;
USE `frs_jwt`;

CREATE TABLE `frs_jwt`.`admins` (
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(50) NOT NULL,
  `email` VARCHAR(200) NOT NULL,
  `password` VARCHAR(200) NOT NULL,
  `activation_status` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`email`));

CREATE TABLE `frs_jwt`.`admin_activity_log` (
    `activity_by` VARCHAR(50) NOT NULL,
    `activity_type` VARCHAR(6) NOT NULL,
    `activity_on` VARCHAR(36) DEFAULT NULL,
    `activity_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP());

CREATE TABLE `frs_jwt`.`users` (
  `user_id` VARCHAR(36) NOT NULL,
  `base_img` VARCHAR(41) NOT NULL,
  `img_ext` VARCHAR(5) NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `mob_no` VARCHAR(20) NOT NULL,
  `gender` VARCHAR(1) NOT NULL,
  `city` VARCHAR(50) NOT NULL,
  `department` VARCHAR(50) NOT NULL,
  `date_created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  `admin` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`user_id`));

CREATE TABLE `frs_jwt`.`user_change_log` (
  `change_by` VARCHAR(50) NOT NULL,
  `change_type` VARCHAR(6) NOT NULL,
  `change_timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  `user_id` VARCHAR(36) NOT NULL,
  `base_img` VARCHAR(41) NOT NULL,
  `img_ext` VARCHAR(5) NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `mob_no` VARCHAR(20) NOT NULL,
  `gender` VARCHAR(1) NOT NULL,
  `city` VARCHAR(50) NOT NULL,
  `department` VARCHAR(50) NOT NULL,
  `date_created` DATETIME NOT NULL);

CREATE TABLE `frs_jwt`.`user_capture_log` (
  `admin` VARCHAR(50) NOT NULL,
  `img_name` VARCHAR(41) NOT NULL,
  `recognition_status` VARCHAR(5) NOT NULL,
  `user_id` VARCHAR(36) NULL,
  `in/out` VARCHAR(3) NOT NULL,
  `date_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP());

DELIMITER $$
CREATE TRIGGER `create_log_on_insert` AFTER INSERT ON `users` FOR EACH ROW 
BEGIN
	INSERT INTO `admin_activity_log` (`activity_by`, `activity_on`, `activity_type`)
    VALUE (NEW.`admin`, NEW.`user_id`, "INSERT");
    INSERT INTO `user_change_log` (`change_by`, `change_type`,`user_id`, `base_img`, `img_ext`, `name`, `mob_no`, `gender`, `city`, `department`, `date_created`) 
    VALUE (NEW.`admin`, "INSERT", NEW.`user_id`, NEW.`base_img`, NEW.`img_ext`, NEW.`name`, NEW.`mob_no`, NEW.`gender`, NEW.`city`, NEW.`department`, NEW.`date_created`);
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER `create_log_on_update` AFTER UPDATE ON `users` FOR EACH ROW 
BEGIN
    IF (NEW.`base_img` != OLD.`base_img` OR NEW.`name` != OLD.`name` OR NEW.`mob_no` != OLD.`mob_no` OR NEW.`gender` != OLD.`gender` OR NEW.`city` != OLD.`city` OR NEW.`department` != OLD.`department`) 
    THEN
        INSERT INTO `admin_activity_log` (`activity_by`, `activity_on`, `activity_type`)
		VALUE (NEW.`admin`, NEW.`user_id`, "UPDATE");
        INSERT INTO `user_change_log` (`change_by`, `change_type`, `user_id`, `base_img`, `img_ext`, `name`, `mob_no`, `gender`, `city`, `department`, `date_created`) 
		VALUE (NEW.`admin`, "UPDATE", NEW.`user_id`, NEW.`base_img`, NEW.`img_ext`, NEW.`name`, NEW.`mob_no`, NEW.`gender`, NEW.`city`, NEW.`department`, NEW.`date_created`);
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER `create_log_on_delete` AFTER DELETE ON `users` FOR EACH ROW
BEGIN
	INSERT INTO `admin_activity_log` (`activity_by`, `activity_on`, `activity_type`)
	VALUE (OLD.`admin`, OLD.`user_id`, "DELETE");
	INSERT INTO `user_change_log` (`change_by`, `change_type`, `user_id`, `base_img`, `img_ext`, `name`, `mob_no`, `gender`, `city`, `department`, `date_created`) 
	VALUE (OLD.`admin`, "DELETE", OLD.`user_id`, OLD.`base_img`, OLD.`img_ext`, OLD.`name`, OLD.`mob_no`, OLD.`gender`, OLD.`city`, OLD.`department`, OLD.`date_created`);
END$$
DELIMITER ;

DELIMITER $$
CREATE PROCEDURE `delete_user`(IN usr_id VARCHAR(36), IN adm VARCHAR(50))
BEGIN
	SELECT `base_img` AS img, `name` FROM `users` WHERE (`user_id` = usr_id AND `admin` = adm);
  DELETE FROM `users` WHERE (`user_id` = usr_id AND `admin` = adm);
END$$
DELIMITER ;

DELIMITER $$
CREATE PROCEDURE `record_user_capture` (IN img VARCHAR(41), IN usr_id VARCHAR(36), IN sts VARCHAR(3), IN adm VARCHAR(50))
BEGIN
	IF (usr_id != "unrecognized") 
    THEN
        INSERT INTO `user_capture_log` (`img_name`, `recognition_status`, `user_id`, `in/out`, `admin`) 
        VALUES (img, "TRUE", usr_id, sts, adm);
        SELECT `user_id`, `base_img`, `name`, `mob_no`, `gender`, `city`, `department`, `date_created` FROM `users` WHERE (`user_id` = usr_id AND `admin` = adm);
    END IF;
    IF (usr_id = "unrecognized") 
    THEN
		INSERT INTO `user_capture_log` (`img_name`, `recognition_status`, `in/out`, `admin`) 
        VALUES (img, "FALSE", sts, adm);
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE PROCEDURE `get_capture_log` (IN adm VARCHAR(50))
BEGIN
  SELECT uc.`user_id`, ut.`name`, uc.`in/out`, uc.`date_time`
  FROM `user_capture_log` uc
  JOIN `users` ut
  ON ut.`user_id` = uc.`user_id`
  WHERE uc.`admin` = adm
  ORDER BY uc.`date_time` DESC
  LIMIT 20;
END$$
DELIMITER ;

DELIMITER $$
CREATE PROCEDURE `get_admin_log` (IN adm VARCHAR(50))
BEGIN
	SELECT `activity_type`, `activity_on`, `activity_time`
	FROM `admin_activity_log`
	WHERE `activity_by` = adm
	ORDER BY `activity_time` DESC
	LIMIT 20;
END$$
DELIMITER ;