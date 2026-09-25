import { isBdPhone } from './phone';

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Accepts any Bangladeshi format; validation and normalization share one implementation. */
export const isValidPhone = (value?: string | null): boolean => isBdPhone(value);

export const isEmpty = (value?: string | null): boolean =>
  !value || !value.trim();
