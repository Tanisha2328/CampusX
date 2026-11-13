ALTER TABLE "Notification"
    DROP CONSTRAINT "Notification_related_entity_category_check";

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_related_entity_category_check" CHECK (
        "relatedEntityId" IS NULL
        OR ("category" IN ('EVENT', 'EVENT_REGISTRATION') AND "relatedEntityType" = 'EVENT')
        OR ("category" = 'ANNOUNCEMENT' AND "relatedEntityType" = 'ANNOUNCEMENT')
        OR ("category" = 'SERVICE_REQUEST' AND "relatedEntityType" = 'SERVICE_REQUEST')
        OR ("category" = 'ASSIGNMENT' AND "relatedEntityType" = 'ASSIGNMENT')
        OR ("category" = 'FACILITY_BOOKING' AND "relatedEntityType" = 'FACILITY_BOOKING')
    );
