export default function errorHandler(error, _request, response, _next) {
  const status = error?.type === 'entity.parse.failed'
    ? 400
    : error?.type === 'entity.too.large'
      ? 413
      : Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
        ? error.status
        : 500

  if (status >= 500) {
    console.error('Unhandled API error.')
  }

  response.status(status).json({
    error: {
      message: status === 400 && error?.type === 'entity.parse.failed'
        ? 'Invalid JSON request body.'
        : status === 413
          ? 'Request body is too large.'
          : status >= 500
            ? 'Internal server error.'
            : 'Request could not be processed.',
    },
  })
}
