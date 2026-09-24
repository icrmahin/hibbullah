export enum AppErrorType {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  NETWORK = 'NETWORK',
  STORAGE = 'STORAGE',
  UNEXPECTED = 'UNEXPECTED',
}

export class AppError extends Error {
  constructor(
    public type: AppErrorType,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function supabaseErrorToAppError(error: any): AppError {
  const message = error?.message || 'An unexpected error occurred'

  if (message.includes('Auth') || message.includes('signIn') || message.includes('signUp')) {
    return new AppError(AppErrorType.AUTHENTICATION, 'Authentication failed. Please try again.')
  }
  if (message.includes('RLS') || message.includes('policy') || message.includes('permission')) {
    return new AppError(AppErrorType.AUTHORIZATION, 'You do not have permission to perform this action.')
  }
  if (message.includes('Insufficient stock')) {
    return new AppError(AppErrorType.INSUFFICIENT_STOCK, 'There is not enough stock available.', { originalMessage: message })
  }
  if (message.includes('Invalid status transition')) {
    return new AppError(AppErrorType.INVALID_TRANSITION, 'This order status change is not allowed.', { originalMessage: message })
  }
  if (message.includes('duplicate') || message.includes('unique')) {
    return new AppError(AppErrorType.CONFLICT, 'This record already exists.', { originalMessage: message })
  }
  if (message.includes('not found') || message.includes('Not found')) {
    return new AppError(AppErrorType.NOT_FOUND, 'The requested resource was not found.', { originalMessage: message })
  }
  if (message.includes('validation')) {
    return new AppError(AppErrorType.VALIDATION, 'The provided data is invalid.', { originalMessage: message })
  }
  return new AppError(AppErrorType.UNEXPECTED, message)
}
