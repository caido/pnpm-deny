export type Maybe<T> = T | undefined;

export const isAbsent = <T>(
  value: T | undefined,
): value is Exclude<T, NonNullable<T>> | undefined => {
  return value === undefined || value === null;
};

export const isPresent = <T>(value: T | undefined): value is NonNullable<T> => {
  return value !== undefined && value !== null;
};
