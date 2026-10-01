import type { TransformFnParams } from 'class-transformer';
import {
  isSameConditionClass,
  normalizeConditionClass,
} from './condition-class';

const normalize = (value: unknown) =>
  normalizeConditionClass({ value } as TransformFnParams);

describe('condition-class helpers', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalize('  Fair \t -   cracked  ')).toBe('Fair - cracked');
    expect(normalize(42)).toBe(42);
  });

  it('compares condition classes without regard to case', () => {
    expect(isSameConditionClass('Good', 'GOOD')).toBe(true);
    expect(isSameConditionClass('Good', 'Fair')).toBe(false);
  });
});
