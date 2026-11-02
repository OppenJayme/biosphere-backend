/**
 * Review-only content candidates from FAQ intake #224 (S01-S04).
 * Facts: Sir Fidel via the user, confirmed 2026-10-30; clarifications received
 * 2026-11-02. IDs are synthetic; aliases/keywords are editorial proposals.
 * ACTIVE below exists only in the isolated HTTP adapter. Never seed/activate
 * this fixture in a shared database as an incidental evaluation step.
 */
import type { SyntheticFaq } from './faq-quality-knowledge';

export const CURATOR_FAQ_IDS = {
  weekday: '90000000-0000-4000-8000-000000000001',
  saturday: '90000000-0000-4000-8000-000000000002',
  closures: '90000000-0000-4000-8000-000000000003',
  admission: '90000000-0000-4000-8000-000000000004',
  appointment: '90000000-0000-4000-8000-000000000005',
  campus: '90000000-0000-4000-8000-000000000006',
  batch: '90000000-0000-4000-8000-000000000007',
  leadTime: '90000000-0000-4000-8000-000000000008',
  photography: '90000000-0000-4000-8000-000000000009',
  permission: '90000000-0000-4000-8000-000000000010',
  handling: '90000000-0000-4000-8000-000000000011',
  conduct: '90000000-0000-4000-8000-000000000012',
  location: '90000000-0000-4000-8000-000000000013',
  assistance: '90000000-0000-4000-8000-000000000014',
  wheelchair: '90000000-0000-4000-8000-000000000015',
  research: '90000000-0000-4000-8000-000000000016',
  contact: '90000000-0000-4000-8000-000000000017',
} as const;

type Draft = Omit<SyntheticFaq, 'status'> & { sourceQuestions: number[] };

export const curatorFaqDrafts: Draft[] = [
  {
    id: CURATOR_FAQ_IDS.weekday,
    question: 'What are the weekday opening hours?',
    answer:
      'Monday to Friday, 8:00-11:00 AM and 1:00-4:00 PM. The museum is closed during holidays, school breaks and university closures.',
    alternative_wording: ['What time do you open on weekdays?'],
    keywords: [
      'weekday',
      'opening hours',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
    ],
    category: 'Visiting Hours',
    sourceQuestions: [1, 3],
  },
  {
    id: CURATOR_FAQ_IDS.saturday,
    question: 'What are the Saturday opening hours?',
    answer:
      'Saturday visiting hours are 8:00-11:00 AM only. The museum is closed during holidays, school breaks and university closures.',
    alternative_wording: ['When can I visit on Saturday?'],
    keywords: ['Saturday', 'opening hours'],
    category: 'Visiting Hours',
    sourceQuestions: [2, 3],
  },
  {
    id: CURATOR_FAQ_IDS.closures,
    question: 'Is the museum open on holidays?',
    answer:
      'The museum is closed during holidays, school breaks and university closures.',
    alternative_wording: [
      'Is it open during school breaks or university closures?',
    ],
    keywords: ['holiday', 'school break', 'university closure'],
    category: 'Visiting Hours',
    sourceQuestions: [3],
  },
  {
    id: CURATOR_FAQ_IDS.admission,
    question: 'How much is admission?',
    answer:
      'Admission is PHP 50 per person. Free admission applies to USC-affiliated visitors (including USC students), alumni, and children in kindergarten or below. The student exemption applies only to USC students, not students from other schools merely because they are students. Admission is free for all visitors during USC Days. Free admission does not waive campus-entry requirements for outside visitors, including alumni.',
    alternative_wording: [
      'What is the entrance fee?',
      'Who can enter for free?',
      'Are students from other schools exempt from admission fees?',
    ],
    keywords: ['admission', 'entrance fee', 'free', 'USC students', 'alumni'],
    category: 'Admission and Access',
    sourceQuestions: [5, 8, 11],
  },
  {
    id: CURATOR_FAQ_IDS.appointment,
    question: 'When is an appointment required?',
    answer:
      'USC student parties of one to four may make an informal visit. Parties of five or more require an appointment. Guided tours require an appointment regardless of size. Outside visitors, including alumni, must follow campus entry; free admission does not authorize a walk-in.',
    alternative_wording: [
      'Can USC students walk in?',
      'Do five visitors need an appointment?',
    ],
    keywords: ['appointment', 'walk in', 'informal', 'five', 'students'],
    category: 'Group Visits',
    sourceQuestions: [4, 16, 17],
  },
  {
    id: CURATOR_FAQ_IDS.campus,
    question: 'Do outside visitors need campus entry?',
    answer:
      'Outside visitors, including alumni, must follow the campus-entry process. Alumni are admitted free but are considered outsiders for campus entry. If arriving in a vehicle, have the campus guard inspect it and direct the driver to the designated parking area.',
    alternative_wording: ['Do alumni need campus entry?'],
    keywords: ['campus entry', 'outside visitors', 'alumni'],
    category: 'Admission and Access',
    sourceQuestions: [5, 11, 12],
  },
  {
    id: CURATOR_FAQ_IDS.batch,
    question: 'What is the maximum school-tour batch size?',
    answer:
      'School tours accommodate a maximum of 50 visitors per batch. Larger parties require separate timed batches, managed by the visiting group. Parties of five or more require an appointment.',
    alternative_wording: ['How many visitors can join one tour batch?'],
    keywords: ['maximum', 'batch', '50', 'school tour'],
    category: 'Group Visits',
    sourceQuestions: [16],
  },
  {
    id: CURATOR_FAQ_IDS.leadTime,
    question: 'How early should a visit be requested?',
    answer:
      'Submit a visit request through BioSphere at least one week before the intended visit. Submitting a request is not approval of the visit or campus entry.',
    alternative_wording: ['How far in advance should I request a visit?'],
    keywords: ['advance', 'one week', 'lead time'],
    category: 'Group Visits',
    sourceQuestions: [13, 14, 18],
  },
  {
    id: CURATOR_FAQ_IDS.photography,
    question: 'Are photographs and videos allowed?',
    answer:
      'Photography and video are allowed. Flash photography, tripods and professional or commercial shoots require permission from the curator.',
    alternative_wording: ['Can I take photographs?'],
    keywords: ['photography', 'photos', 'video'],
    category: 'Museum Rules',
    sourceQuestions: [20, 21],
  },
  {
    id: CURATOR_FAQ_IDS.permission,
    question:
      'Do flash photography, tripods or commercial shoots require permission?',
    answer:
      'Flash photography, tripods and professional or commercial shoots require permission from the curator.',
    alternative_wording: ['Can I use flash for photos?', 'May I use a tripod?'],
    keywords: ['flash', 'tripod', 'commercial', 'professional'],
    category: 'Museum Rules',
    sourceQuestions: [21],
  },
  {
    id: CURATOR_FAQ_IDS.handling,
    question: 'May I touch specimens or displays?',
    answer: 'Visitors may not touch specimens or displays.',
    alternative_wording: ['Can visitors handle the specimens?'],
    keywords: ['touch', 'handle', 'display'],
    category: 'Museum Rules',
    sourceQuestions: [22],
  },
  {
    id: CURATOR_FAQ_IDS.conduct,
    question: 'What conduct is expected inside the museum?',
    answer: 'Avoid loud noise, running and roughhousing.',
    alternative_wording: ['Can visitors run or make loud noises?'],
    keywords: ['noise', 'running', 'roughhousing'],
    category: 'Museum Rules',
    sourceQuestions: [24],
  },
  {
    id: CURATOR_FAQ_IDS.location,
    question: 'Where is the museum located?',
    answer:
      'Third Level, Learning Resource Center, Josef Baumgartner Building, University of San Carlos, Talamban Campus, Nasipit, Cebu City, Philippines.',
    alternative_wording: ['What is the museum address?'],
    keywords: ['location', 'address', 'Talamban', 'Nasipit'],
    category: 'Location and Arrival',
    sourceQuestions: [9],
  },
  {
    id: CURATOR_FAQ_IDS.assistance,
    question: 'How can I request assistance or special arrangements?',
    answer:
      'Send a General Inquiry through BioSphere to request assistance or special arrangements.',
    alternative_wording: ['How do I ask for visitor assistance?'],
    keywords: ['assistance', 'special arrangements'],
    category: 'Accessibility and Assistance',
    sourceQuestions: [26],
  },
  {
    id: CURATOR_FAQ_IDS.wheelchair,
    question: 'What wheelchair-accessibility facilities are available?',
    answer:
      'Ramps are available for wheelchair users. Send a General Inquiry through BioSphere to request assistance or special arrangements.',
    alternative_wording: ['Are wheelchair ramps available?'],
    keywords: ['wheelchair', 'ramp', 'accessibility'],
    category: 'Accessibility and Assistance',
    sourceQuestions: [25, 26],
  },
  {
    id: CURATOR_FAQ_IDS.research,
    question: 'Can researchers request access to non-public specimens?',
    answer:
      'Research access is limited to researchers. Submit the request through the Visit Request form; the request does not itself grant access or handling permission.',
    alternative_wording: ['How do I request a research visit?'],
    keywords: ['research', 'researcher', 'non-public specimens'],
    category: 'Research',
    sourceQuestions: [28],
  },
  {
    id: CURATOR_FAQ_IDS.contact,
    question: 'Who can answer questions outside this FAQ?',
    answer:
      'Contact the museum curator. You can send a General Inquiry through BioSphere so a curator can respond.',
    alternative_wording: ['Who should I contact with other questions?'],
    keywords: ['contact', 'curator', 'general inquiry'],
    category: 'Contact',
    sourceQuestions: [26, 29],
  },
];

export function curatorEvaluationKnowledge(): SyntheticFaq[] {
  return curatorFaqDrafts.map((entry) => ({
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    category: entry.category,
    alternative_wording: [...entry.alternative_wording],
    keywords: [...entry.keywords],
    status: 'ACTIVE',
  }));
}
