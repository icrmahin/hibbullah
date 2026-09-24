export type ServiceResult<T> = {
  data: T;
  error?: string;
};

export function ok<T>(data: T): ServiceResult<T> {
  return { data };
}

export function fail<T>(error: string, data: T): ServiceResult<T> {
  return { data, error };
}
