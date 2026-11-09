import { ConfigService } from '@nestjs/config';
import { AiProvider, AiProviderError } from './ai-provider';
import {
  FaqAiComposerService,
  FaqAiSource,
  isSupportedBySources,
} from './faq-ai-composer.service';

const HOURS: FaqAiSource = {
  id: '11111111-1111-4111-8111-111111111111',
  question: 'What are Saturday visiting hours?',
  answer: 'On Saturday the museum is open from 8:00 AM to 12 noon.',
};
const ADMISSION: FaqAiSource = {
  id: '22222222-2222-4222-8222-222222222222',
  question: 'How much is admission?',
  answer:
    'Admission is ₱50 for outside visitors. Email museum@example.edu for school groups.',
};

function composer(
  settings: Record<string, string>,
  generateJson: jest.Mock,
  configured = true,
) {
  const provider: AiProvider = {
    label: 'test:model',
    isConfigured: () => configured,
    generateJson,
  };
  return new FaqAiComposerService(
    { get: (key: string) => settings[key] } as unknown as ConfigService,
    provider,
  );
}

const ENABLED = { CHATBOT_AI_ENABLED: 'true' };
const input = (sources: FaqAiSource[] = [HOURS, ADMISSION]) => ({
  question: 'is it open saturday',
  history: ['Where is the museum?'],
  sources,
  clientKey: '203.0.113.5',
});

describe('isSupportedBySources', () => {
  it('accepts reworded answers whose details all appear in the sources', () => {
    expect(
      isSupportedBySources(
        'Yes! On Saturday you can visit from 8:00 AM until 12 noon.',
        [HOURS],
      ),
    ).toBe(true);
    expect(
      isSupportedBySources(
        'Outside visitors pay ₱50. School groups can email museum@example.edu.',
        [ADMISSION],
      ),
    ).toBe(true);
  });

  it.each([
    ['an invented time', 'On Saturday it opens at 9:00 AM.'],
    ['an invented day', 'It is open on Saturday and Sunday from 8:00 AM.'],
    ['a changed price', 'Admission is ₱100.'],
    ['an invented free claim', 'Entry on Saturday is free.'],
    ['a number in words', 'It is open for four hours on Saturday.'],
    ['an invented email', 'Write to info@usc.edu.ph about Saturday hours.'],
    ['an invented link', 'See https://usc.edu.ph/museum for Saturday hours.'],
    ['a booking claim', "I've booked your visit for Saturday at 8:00 AM."],
    ['a confirmation claim', 'Your visit has been confirmed for Saturday.'],
  ])('rejects %s', (_label, text) => {
    expect(isSupportedBySources(text, [HOURS])).toBe(false);
  });
});

describe('FaqAiComposerService', () => {
  it('does nothing when disabled, unconfigured or without sources', async () => {
    const generate = jest.fn();
    await expect(composer({}, generate).compose(input())).resolves.toEqual({
      kind: 'none',
    });
    await expect(
      composer(ENABLED, generate, false).compose(input()),
    ).resolves.toEqual({ kind: 'none' });
    await expect(
      composer(ENABLED, generate).compose(input([])),
    ).resolves.toEqual({ kind: 'none' });
    expect(generate).not.toHaveBeenCalled();
    expect(composer(ENABLED, generate, false).isEnabled()).toBe(false);
    expect(composer(ENABLED, generate).isEnabled()).toBe(true);
  });

  it('returns a cited, supported answer', async () => {
    const generate = jest.fn().mockResolvedValue({
      status: 'ANSWER',
      answer: 'Yes. On Saturday the museum is open 8:00 AM to 12 noon.',
      sourceIds: [HOURS.id],
    });
    await expect(composer(ENABLED, generate).compose(input())).resolves.toEqual(
      {
        kind: 'answer',
        text: 'Yes. On Saturday the museum is open 8:00 AM to 12 noon.',
        sourceIds: [HOURS.id],
      },
    );
    const request = generate.mock.calls[0][0] as {
      prompt: string;
      system: string;
    };
    // Sources and visitor text travel as delimited JSON data.
    expect(JSON.parse(request.prompt)).toEqual({
      earlierVisitorQuestions: ['Where is the museum?'],
      previousTopic: null,
      latestQuestion: 'is it open saturday',
      SOURCES: [HOURS, ADMISSION],
    });
    expect(request.system).toContain(
      'Answer ONLY with facts stated in SOURCES',
    );
  });

  it.each([
    [
      'an unknown source id',
      { status: 'ANSWER', answer: 'Open Saturday.', sourceIds: ['x'] },
    ],
    [
      'no citations',
      { status: 'ANSWER', answer: 'Open Saturday.', sourceIds: [] },
    ],
    [
      'a detail missing from the cited source',
      {
        status: 'ANSWER',
        answer: 'On Saturday admission is ₱50.',
        sourceIds: [HOURS.id],
      },
    ],
    ['an explicit refusal', { status: 'NO_ANSWER', answer: '', sourceIds: [] }],
    ['an unknown status', { status: 'MAYBE', answer: 'x', sourceIds: [] }],
    ['a non-object', 'Open Saturday'],
    [
      'an overlong answer',
      { status: 'ANSWER', answer: 'a'.repeat(701), sourceIds: [HOURS.id] },
    ],
  ])('falls back on %s', async (_label, raw) => {
    const generate = jest.fn().mockResolvedValue(raw);
    await expect(composer(ENABLED, generate).compose(input())).resolves.toEqual(
      { kind: 'none' },
    );
  });

  it('returns a supported clarifying question', async () => {
    const generate = jest.fn().mockResolvedValue({
      status: 'CLARIFY',
      answer: 'Do you mean Saturday hours or admission?',
      sourceIds: [],
    });
    await expect(composer(ENABLED, generate).compose(input())).resolves.toEqual(
      { kind: 'clarify', text: 'Do you mean Saturday hours or admission?' },
    );
  });

  it('falls back and stops calling the provider after a rate limit', async () => {
    const generate = jest
      .fn()
      .mockRejectedValue(new AiProviderError('rate_limited'));
    const service = composer(ENABLED, generate);
    await expect(service.compose(input())).resolves.toEqual({ kind: 'none' });
    await expect(service.compose(input())).resolves.toEqual({ kind: 'none' });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('enforces the per-client hourly cap', async () => {
    const generate = jest
      .fn()
      .mockResolvedValue({ status: 'NO_ANSWER', answer: '', sourceIds: [] });
    const service = composer(
      { ...ENABLED, CHATBOT_AI_MAX_PER_CLIENT_PER_HOUR: '2' },
      generate,
    );
    for (let i = 0; i < 3; i += 1) await service.compose(input());
    expect(generate).toHaveBeenCalledTimes(2);
    await service.compose({ ...input(), clientKey: '198.51.100.7' });
    expect(generate).toHaveBeenCalledTimes(3);
  });
});
