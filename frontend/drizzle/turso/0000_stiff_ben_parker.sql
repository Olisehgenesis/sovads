CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`campaign_id` text NOT NULL,
	`ad_id` text NOT NULL,
	`publisher_id` text,
	`site_id` text,
	`fingerprint` text,
	`wallet` text,
	`verified_human` integer DEFAULT false NOT NULL,
	`ip_hash` text,
	`country` text,
	`user_agent` text,
	`tracking_token` text,
	`page_url` text,
	`timestamp` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_campaign_time_idx` ON `events` (`campaign_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `events_site_time_idx` ON `events` (`site_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `events_dedup_idx` ON `events` (`fingerprint`,`campaign_id`,`type`,`timestamp`);--> statement-breakpoint
CREATE TABLE `pageviews` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`publisher_id` text NOT NULL,
	`pathname` text NOT NULL,
	`referrer` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`device` text,
	`browser` text,
	`os` text,
	`country` text,
	`visitor_hash` text NOT NULL,
	`session_hash` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pageviews_site_time_idx` ON `pageviews` (`site_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `pageviews_visitor_site_idx` ON `pageviews` (`visitor_hash`,`site_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `sdk_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`endpoint` text,
	`method` text,
	`site_id` text,
	`domain` text,
	`page_url` text,
	`fingerprint` text,
	`payload_json` text,
	`response_status` integer,
	`duration_ms` integer,
	`error_text` text,
	`timestamp` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sdk_logs_type_time_idx` ON `sdk_logs` (`type`,`timestamp`);--> statement-breakpoint
CREATE TABLE `task_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`completion_id` text,
	`campaign_id` text NOT NULL,
	`site_id` text,
	`viewer_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`wallet` text,
	`verified_human` integer DEFAULT false NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_responses_task_kind_time_idx` ON `task_responses` (`task_id`,`kind`,`timestamp`);--> statement-breakpoint
CREATE INDEX `task_responses_wallet_task_idx` ON `task_responses` (`wallet`,`task_id`);--> statement-breakpoint
CREATE INDEX `task_responses_fingerprint_task_idx` ON `task_responses` (`fingerprint`,`task_id`);