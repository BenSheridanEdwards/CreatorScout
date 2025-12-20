-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "profiles" (
    "username" TEXT NOT NULL,
    "display_name" TEXT,
    "bio_text" TEXT,
    "link_url" TEXT,
    "bio_score" INTEGER NOT NULL DEFAULT 0,
    "is_patreon" BOOLEAN NOT NULL DEFAULT false,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "dm_sent" BOOLEAN NOT NULL DEFAULT false,
    "dm_sent_at" TIMESTAMPTZ(6),
    "followed" BOOLEAN NOT NULL DEFAULT false,
    "proof_path" TEXT,
    "visited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_time_seconds" INTEGER,
    "discovery_source" TEXT,
    "discovery_depth" INTEGER NOT NULL DEFAULT 0,
    "session_id" TEXT,
    "content_categories" JSONB,
    "engagement_metrics" JSONB,
    "vision_api_calls" INTEGER NOT NULL DEFAULT 0,
    "errors_encountered" JSONB,
    "last_error_at" TIMESTAMPTZ(6),
    "source_profile" TEXT,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "queue" (
    "username" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "source" TEXT,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "following_scraped" (
    "username" TEXT NOT NULL,
    "scroll_index" INTEGER NOT NULL DEFAULT 0,
    "scraped_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "following_scraped_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" BIGSERIAL NOT NULL,
    "date" DATE,
    "session_id" TEXT,
    "profiles_visited" INTEGER NOT NULL DEFAULT 0,
    "creators_found" INTEGER NOT NULL DEFAULT 0,
    "dms_sent" INTEGER NOT NULL DEFAULT 0,
    "follows_completed" INTEGER NOT NULL DEFAULT 0,
    "avg_bio_score" DECIMAL(5,2),
    "avg_confidence" DECIMAL(5,2),
    "vision_api_cost" DECIMAL(6,4),
    "avg_processing_time_seconds" DECIMAL(6,2),
    "errors_encountered" INTEGER NOT NULL DEFAULT 0,
    "rate_limits_hit" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_dm_sent" ON "profiles"("dm_sent");

-- CreateIndex
CREATE INDEX "idx_is_patreon" ON "profiles"("is_patreon");

-- CreateIndex
CREATE INDEX "idx_visited" ON "profiles"("visited_at");

-- CreateIndex
CREATE INDEX "idx_metrics_date" ON "metrics"("date");

-- CreateIndex
CREATE INDEX "idx_metrics_session" ON "metrics"("session_id");
