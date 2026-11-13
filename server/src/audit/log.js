export async function writeAuditLog(auditRepository, {
  actorId,
  action,
  entityType,
  entityId,
  details,
}) {
  if (!auditRepository?.auditLog?.create) {
    throw new Error('An audit repository with auditLog.create() is required.')
  }

  await auditRepository.auditLog.create({
    data: { actorId, action, entityType, entityId, details },
  })
}
