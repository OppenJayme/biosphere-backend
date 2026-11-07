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

  it('saves a standard condition with its listed spelling', () => {
    expect(normalize('good')).toBe('Good');
    expect(normalize('  EXCELLENT ')).toBe('Excellent');
    expect(normalize('critical')).toBe('Critical');
  });

  it('keeps the spelling of a condition that is not on the list', () => {
    expect(normalize('fair - cracked')).toBe('fair - cracked');
    expect(normalize('Needs Repair')).toBe('Needs Repair');
  });

  it('compares condition classes without regard to case', () => {
    expect(isSameConditionClass('Good', 'GOOD')).toBe(true);
    expect(isSameConditionClass('Good', 'Fair')).toBe(false);
  });
});
