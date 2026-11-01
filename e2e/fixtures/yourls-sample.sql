-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
--
-- Host: localhost    Database: yourls
-- ------------------------------------------------------
-- Server version	8.0.36-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;

--
-- Table structure for table `yourls_log`
--

DROP TABLE IF EXISTS `yourls_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `yourls_log` (
  `click_id` int NOT NULL AUTO_INCREMENT,
  `click_time` datetime NOT NULL,
  `shorturl` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `referrer` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `user_agent` varchar(255) NOT NULL,
  `ip_address` varchar(41) NOT NULL,
  `country_code` char(2) NOT NULL,
  PRIMARY KEY (`click_id`),
  KEY `shorturl` (`shorturl`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `yourls_log`
--

LOCK TABLES `yourls_log` WRITE;
/*!40000 ALTER TABLE `yourls_log` DISABLE KEYS */;
INSERT INTO `yourls_log` VALUES (1,'2020-03-15 10:35:00','yl-home','direct','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36','203.0.113.10','IT'),(2,'2020-03-15 11:00:00','yl-home','https://t.co/abc','Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1','203.0.113.11','IT'),(3,'2020-03-16 08:00:00','yl-home','https://www.google.com/search?q=it\'s+home','Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)','198.51.100.7','US'),(4,'2020-03-16 09:00:00','yl-home','','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36','203.0.113.10','IT'),(5,'2021-07-01 12:00:00','yl-home','https://t.co/abc','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36','203.0.113.10','');
INSERT INTO `yourls_log` VALUES (6,'2021-08-10 19:20:21','yl-emoji','https://example.org/page','Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36','192.0.2.55','DE'),(7,'2021-08-11 19:20:21','yl-emoji','direct','','192.0.2.56','FR'),(8,'2021-08-12 00:00:00','yl-emoji','direct','curl/8.4.0','','');
INSERT INTO `yourls_log` VALUES (9,'2022-02-02 02:02:02','yl-multi','direct','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36','203.0.113.99','GB'),(10,'2022-05-05 05:05:05','yl-ghost','direct','Mozilla/5.0','203.0.113.1','IT'),(11,'2022-05-06 05:05:05','yl-ghost','direct','Mozilla/5.0','203.0.113.2','IT'),(12,'2023-01-31 23:59:59','yl-back','direct','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36','203.0.113.10','IT');
/*!40000 ALTER TABLE `yourls_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `yourls_options`
--

DROP TABLE IF EXISTS `yourls_options`;
CREATE TABLE `yourls_options` (
  `option_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `option_name` varchar(64) NOT NULL DEFAULT '',
  `option_value` longtext NOT NULL,
  PRIMARY KEY (`option_id`,`option_name`),
  KEY `option_name` (`option_name`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

LOCK TABLES `yourls_options` WRITE;
INSERT INTO `yourls_options` VALUES (1,'version','1.10.3'),(2,'db_version','1800'),(3,'next_id_after_00','1');
UNLOCK TABLES;

--
-- Table structure for table `yourls_url`
--

DROP TABLE IF EXISTS `yourls_url`;
CREATE TABLE `yourls_url` (
  `keyword` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `title` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip` varchar(41) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `clicks` int unsigned NOT NULL,
  PRIMARY KEY (`keyword`),
  KEY `timestamp` (`timestamp`),
  KEY `ip` (`ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `yourls_url`
--

LOCK TABLES `yourls_url` WRITE;
/*!40000 ALTER TABLE `yourls_url` DISABLE KEYS */;
INSERT INTO `yourls_url` VALUES ('yl-home','https://example.com/it\'s-home','L\'azienda, \"Home\" (2021)','2020-03-15 10:30:00','203.0.113.10',5),('yl-emoji','https://example.com/caff%C3%A8?q=%E2%98%95','Caffè ☕ 🚀','2021-08-10 19:00:00','203.0.113.10',3),('yl-multi','https://example.com/a?x=1,2&y=(3)','a,b);(c''d',  '2022-02-02 02:00:00','203.0.113.10',10),('yl-notitle','https://example.com/no-title',NULL,'2022-03-03 03:03:03','203.0.113.10',0);
INSERT INTO `yourls_url` VALUES ('yl-back','https://example.com/back','C:\\dir\\file\nsecond line','2023-01-31 23:00:00','203.0.113.10',1),('yl-Upper-1','https://example.com/Upper',' ','2023-02-01 00:00:00','203.0.113.10',0),('yl-zero','https://example.com/zero','','0000-00-00 00:00:00','203.0.113.10',0);
/*!40000 ALTER TABLE `yourls_url` ENABLE KEYS */;
UNLOCK TABLES;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;

-- Dump completed on 2026-10-30 21:00:01
