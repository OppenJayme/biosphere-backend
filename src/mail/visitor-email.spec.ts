import { withReference } from './visitor-email';

describe('withReference', () => {
  it('adds the marker to a custom subject that has none', () => {
    expect(withReference('Email Approval', 'E2C89B18')).toBe(
      'Email Approval (Ref E2C89B18)',
    );
  });

  it('keeps a subject that already has this record’s marker', () => {
    expect(withReference('Visit update (Ref E2C89B18)', 'E2C89B18')).toBe(
      'Visit update (Ref E2C89B18)',
    );
    // Case and spacing inside the marker do not matter.
    expect(withReference('Visit update (ref  e2c89b18 )', 'e2c89b18')).toBe(
      'Visit update (ref  e2c89b18 )',
    );
  });

  it('still adds the marker when only the bare code is in the subject', () => {
    expect(withReference('About E2C89B18', 'E2C89B18')).toBe(
      'About E2C89B18 (Ref E2C89B18)',
    );
    expect(withReference('Ref E2C89B18 follow-up', 'E2C89B18')).toBe(
      'Ref E2C89B18 follow-up (Ref E2C89B18)',
    );
  });

  it('adds this record’s marker beside another record’s marker', () => {
    expect(withReference('Re: visit (Ref 14D4337D)', 'E2C89B18')).toBe(
      'Re: visit (Ref 14D4337D) (Ref E2C89B18)',
    );
  });

  it('writes the code in capitals', () => {
    expect(withReference('Hello', 'e2c89b18')).toBe('Hello (Ref E2C89B18)');
  });
});
