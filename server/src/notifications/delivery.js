const maxDeliveryAttempts = 2
const retryDelayMs = 50

function reportDeliveryFailure(operation, error, attempts) {
  console.error('Notification delivery failed.', { operation, attempts, error })
}

async function retryDelivery(operation, deliver, canRetry) {
  for (let attempt = 1; attempt <= maxDeliveryAttempts; attempt += 1) {
    try {
      await deliver()
      return true
    } catch (error) {
      if (error?.code === 'P2002') return true
      if (!canRetry || attempt === maxDeliveryAttempts) {
        reportDeliveryFailure(operation, error, attempt)
        return false
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
    }
  }
  return false
}

export async function deliverNotification(notificationRepository, data) {
  if (typeof notificationRepository?.notification?.create !== 'function') {
    reportDeliveryFailure(
      'create notification',
      new Error('Notification repository does not provide create().'),
      0,
    )
    return false
  }

  return retryDelivery(
    'create notification',
    () => notificationRepository.notification.create({ data }),
    typeof data.dedupeKey === 'string' && data.dedupeKey.length > 0,
  )
}

export async function deliverToCampusUsers({
  userRepository,
  notificationRepository,
  excludeUserId,
  notificationFor,
}) {
  if (typeof userRepository?.findMany !== 'function') {
    reportDeliveryFailure(
      'load campus notification recipients',
      new Error('User repository does not provide findMany().'),
      0,
    )
    return false
  }
  if (typeof notificationRepository?.notification?.create !== 'function') {
    reportDeliveryFailure(
      'create campus notifications',
      new Error('Notification repository does not provide create().'),
      0,
    )
    return false
  }

  let users
  const usersLoaded = await retryDelivery(
    'load campus notification recipients',
    async () => {
      users = await userRepository.findMany({
        where: excludeUserId ? { id: { not: excludeUserId } } : {},
        select: { id: true },
      })
    },
    true,
  )
  if (!usersLoaded) return false

  let data
  try {
    data = users.map((user) => notificationFor(user.id))
  } catch (error) {
    reportDeliveryFailure('build campus notifications', error, 1)
    return false
  }
  if (typeof notificationRepository.notification.createMany === 'function') {
    return retryDelivery(
      'create campus notifications',
      () => notificationRepository.notification.createMany({ data, skipDuplicates: true }),
      data.length > 0 && data.every((item) => (
        typeof item.dedupeKey === 'string' && item.dedupeKey.length > 0
      )),
    )
  }
  const results = await Promise.all(data.map((notification) => (
    deliverNotification(notificationRepository, notification)
  )))
  return results.every(Boolean)
}
