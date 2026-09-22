export const METHODS = [
  'HEAD',
  'GET',
  'POST',
  'PATCH',
  'PUT',
  'DELETE',
  'OPTIONS',
] as const;

export type Method = (typeof METHODS)[number];
