export const DEFAULT_EFFECT = 'spoiler' as const;

export type Effect = 'blur' | 'dummy' | 'placeholder' | 'spoiler';

export function isEffect(value: unknown): value is Effect {
  return value === 'blur' || value === 'dummy' || value === 'placeholder' || value === 'spoiler';
}
