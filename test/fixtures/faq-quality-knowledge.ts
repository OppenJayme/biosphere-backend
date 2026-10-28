/** Entirely fictional local fixtures. NEVER import/activate these as museum knowledge. */
export type SyntheticFaq = {
  id: string;
  question: string;
  answer: string;
  alternative_wording: string[];
  keywords: string[];
  category: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
};

export function syntheticFaqKnowledge(): SyntheticFaq[] {
  return [
    {
      id: '11111111-1111-4111-8111-111111111111',
      question: 'What is the admission fee?',
      answer: 'TEST ONLY: Admission is five fictional credits.',
      alternative_wording: ['How much is entry?'],
      keywords: ['admission', 'fee'],
      category: 'Fees',
      status: 'ACTIVE',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      question: 'What are the weekday opening hours?',
      answer: 'TEST ONLY: Weekday hours are 09:00 to 12:00.',
      alternative_wording: ['When can I visit on weekdays?'],
      keywords: ['weekday', 'hours'],
      category: 'Hours',
      status: 'ACTIVE',
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      question: 'What are the weekend opening hours?',
      answer: 'TEST ONLY: Weekend hours are 14:00 to 16:00.',
      alternative_wording: ['When can I visit on weekends?'],
      keywords: ['weekend', 'hours'],
      category: 'Hours',
      status: 'ACTIVE',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      question: 'Is photography allowed?',
      answer: 'TEST ONLY: Non-flash photography is permitted.',
      alternative_wording: [
        'Can I take photographs?',
        'What photography is permitted?',
      ],
      keywords: ['photography', 'photos'],
      category: 'Photography',
      status: 'ACTIVE',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      question: 'Is flash photography allowed?',
      answer: 'TEST ONLY: Flash photography is not permitted.',
      alternative_wording: [
        'Can I use flash for photos?',
        'What photography is permitted?',
      ],
      keywords: ['flash', 'photography', 'photos'],
      category: 'Photography',
      status: 'ACTIVE',
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      question: 'How do I request a group visit?',
      answer:
        'TEST ONLY: Use the Visit Request form; this answer does not approve a visit.',
      alternative_wording: ['How do I book a group tour?'],
      keywords: ['group', 'visit', 'request', 'book'],
      category: 'Visits',
      status: 'ACTIVE',
    },
    {
      id: '77777777-7777-4777-8777-777777777777',
      question: 'What are the holiday opening hours?',
      answer: 'TEST ONLY: INACTIVE holiday answer must never be public.',
      alternative_wording: ['Is the museum open on holidays?'],
      keywords: ['holiday', 'hours'],
      category: 'Hours',
      status: 'INACTIVE',
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      question: 'Where can I park?',
      answer: 'TEST ONLY: ARCHIVED parking answer must never be public.',
      alternative_wording: [],
      keywords: ['parking', 'park'],
      category: 'Transport',
      status: 'ARCHIVED',
    },
  ];
}
