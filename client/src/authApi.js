export async function apiRequest(path, options = {}) {
  let response

  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Unable to reach CampusX. Check your connection and try again.')
  }

  let body

  try {
    body = response.status === 204 ? null : await response.json()
  } catch {
    throw new Error('CampusX returned an unexpected response. Please try again.')
  }

  if (!response.ok) {
    const error = new Error(body?.error?.message || 'Your request could not be completed.')
    error.status = response.status
    throw error
  }

  return body
}

export function authRequest(path, options = {}) {
  return apiRequest(`/auth${path}`, options)
}
