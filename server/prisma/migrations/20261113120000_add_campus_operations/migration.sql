CREATE TYPE "FacilityBookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "Facility" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Facility_capacity_check" CHECK ("capacity" > 0 AND "capacity" <= 10000),
    CONSTRAINT "Facility_name_length_check" CHECK (char_length("name") BETWEEN 2 AND 120)
);

CREATE TABLE "FacilityBooking" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "FacilityBookingStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FacilityBooking_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FacilityBooking_time_order_check" CHECK ("endsAt" > "startsAt"),
    CONSTRAINT "FacilityBooking_title_length_check" CHECK (char_length("title") BETWEEN 3 AND 150),
    CONSTRAINT "FacilityBooking_purpose_length_check" CHECK (char_length("purpose") BETWEEN 3 AND 2000)
);

CREATE TABLE "AttendanceQrToken" (
    "id" UUID NOT NULL,
    "classSessionId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceQrToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AttendanceQrToken_time_order_check" CHECK ("expiresAt" > "validFrom")
);

CREATE TABLE "EventCertificate" (
    "id" UUID NOT NULL,
    "certificateId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Facility_name_key" ON "Facility"("name");
CREATE INDEX "Facility_isActive_name_idx" ON "Facility"("isActive", "name");
CREATE INDEX "FacilityBooking_facilityId_status_startsAt_endsAt_idx" ON "FacilityBooking"("facilityId", "status", "startsAt", "endsAt");
CREATE INDEX "FacilityBooking_requesterId_createdAt_idx" ON "FacilityBooking"("requesterId", "createdAt");
CREATE INDEX "FacilityBooking_status_createdAt_idx" ON "FacilityBooking"("status", "createdAt");
CREATE UNIQUE INDEX "AttendanceQrToken_classSessionId_key" ON "AttendanceQrToken"("classSessionId");
CREATE UNIQUE INDEX "AttendanceQrToken_tokenHash_key" ON "AttendanceQrToken"("tokenHash");
CREATE INDEX "AttendanceQrToken_expiresAt_idx" ON "AttendanceQrToken"("expiresAt");
CREATE UNIQUE INDEX "EventCertificate_certificateId_key" ON "EventCertificate"("certificateId");
CREATE UNIQUE INDEX "EventCertificate_eventId_studentId_key" ON "EventCertificate"("eventId", "studentId");
CREATE INDEX "EventCertificate_studentId_issuedAt_idx" ON "EventCertificate"("studentId", "issuedAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceQrToken" ADD CONSTRAINT "AttendanceQrToken_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventCertificate" ADD CONSTRAINT "EventCertificate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventCertificate" ADD CONSTRAINT "EventCertificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
