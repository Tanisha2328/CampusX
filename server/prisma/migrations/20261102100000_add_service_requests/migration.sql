-- CreateEnum
CREATE TYPE "ServiceRequestCategory" AS ENUM ('FACILITIES', 'IT_SUPPORT', 'ACADEMIC', 'FINANCIAL', 'LIBRARY', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ServiceRequestNoteType" AS ENUM ('PROGRESS', 'RESOLUTION');

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "assignedToId" UUID,
    "category" "ServiceRequestCategory" NOT NULL,
    "priority" "ServiceRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ServiceRequest_title_length_check" CHECK (char_length("title") BETWEEN 3 AND 150),
    CONSTRAINT "ServiceRequest_description_length_check" CHECK (char_length("description") BETWEEN 10 AND 5000)
);

-- CreateTable
CREATE TABLE "ServiceRequestNote" (
    "id" UUID NOT NULL,
    "serviceRequestId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "type" "ServiceRequestNoteType" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequestNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ServiceRequestNote_content_length_check" CHECK (char_length("content") BETWEEN 1 AND 2000)
);

-- CreateIndex
CREATE INDEX "ServiceRequest_studentId_createdAt_idx" ON "ServiceRequest"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_assignedToId_status_createdAt_idx" ON "ServiceRequest"("assignedToId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_category_status_createdAt_idx" ON "ServiceRequest"("category", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_createdAt_idx" ON "ServiceRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequestNote_serviceRequestId_createdAt_idx" ON "ServiceRequestNote"("serviceRequestId", "createdAt");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestNote" ADD CONSTRAINT "ServiceRequestNote_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestNote" ADD CONSTRAINT "ServiceRequestNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
