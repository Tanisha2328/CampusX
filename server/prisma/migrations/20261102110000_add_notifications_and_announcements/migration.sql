-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ANNOUNCEMENT', 'EVENT', 'EVENT_REGISTRATION', 'SERVICE_REQUEST', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('ANNOUNCEMENT', 'EVENT', 'SERVICE_REQUEST', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "AnnouncementCategory" AS ENUM ('GENERAL', 'ACADEMIC', 'EVENTS', 'URGENT');

-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "relatedEntityId" UUID,
    "relatedEntityType" "NotificationEntityType",
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMPTZ(3),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Notification_related_entity_pair_check" CHECK (
        ("relatedEntityId" IS NULL) = ("relatedEntityType" IS NULL)
    ),
    CONSTRAINT "Notification_related_entity_category_check" CHECK (
        "relatedEntityId" IS NULL
        OR ("category" IN ('EVENT', 'EVENT_REGISTRATION') AND "relatedEntityType" = 'EVENT')
        OR ("category" = 'ANNOUNCEMENT' AND "relatedEntityType" = 'ANNOUNCEMENT')
        OR ("category" = 'SERVICE_REQUEST' AND "relatedEntityType" = 'SERVICE_REQUEST')
        OR ("category" = 'ASSIGNMENT' AND "relatedEntityType" = 'ASSIGNMENT')
    ),
    CONSTRAINT "Notification_read_state_check" CHECK (
        ("isRead" = false AND "readAt" IS NULL)
        OR ("isRead" = true AND "readAt" IS NOT NULL)
    ),
    CONSTRAINT "Notification_content_length_check" CHECK (
        char_length("title") BETWEEN 1 AND 150
        AND char_length("message") BETWEEN 1 AND 2000
    )
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "eventId" UUID,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" "AnnouncementCategory" NOT NULL,
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Announcement_content_length_check" CHECK (
        char_length("title") BETWEEN 3 AND 150
        AND char_length("message") BETWEEN 1 AND 5000
    ),
    CONSTRAINT "Announcement_expiry_order_check" CHECK (
        "expiresAt" IS NULL
        OR "publishAt" IS NULL
        OR "expiresAt" > "publishAt"
    ),
    CONSTRAINT "Announcement_event_category_check" CHECK (
        "eventId" IS NULL OR "category" = 'EVENTS'
    ),
    CONSTRAINT "Announcement_scheduled_time_check" CHECK (
        "status" <> 'SCHEDULED' OR "publishAt" IS NOT NULL
    ),
    CONSTRAINT "Announcement_published_time_check" CHECK (
        "status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_recipientId_isRead_createdAt_idx" ON "Notification"("recipientId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_status_publishAt_expiresAt_idx" ON "Announcement"("status", "publishAt", "expiresAt");

-- CreateIndex
CREATE INDEX "Announcement_category_status_publishAt_idx" ON "Announcement"("category", "status", "publishAt");

-- CreateIndex
CREATE INDEX "Announcement_createdById_createdAt_idx" ON "Announcement"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_eventId_idx" ON "Announcement"("eventId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
