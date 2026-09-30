import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const EMAIL = {
  to: 'visitor@example.com',
  toName: 'Visitor',
  subject: 'Subject',
  text: 'Text',
  html: '<p>Text</p>',
};

describe('MailService', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  const serviceWith = (env: Record<string, string | undefined>) =>
    new MailService({
      get: (key: string) => env[key],
    } as unknown as ConfigService);

  const configured = {
    BREVO_API_KEY: 'xkeysib-test',
    MAIL_FROM_EMAIL: 'museum@example.com',
    MAIL_FROM_NAME: 'BioSphere Museum',
    NODE_ENV: 'development',
  };

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('never sends while running tests', async () => {
    const result = await serviceWith({
      ...configured,
      NODE_ENV: 'test',
    }).send(EMAIL);

    expect(result).toEqual({
      delivered: false,
      result: 'NOT_SENT test environment',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips sending when Brevo is not configured', async () => {
    const result = await serviceWith({ NODE_ENV: 'development' }).send(EMAIL);

    expect(result.delivered).toBe(false);
    expect(result.result).toBe('NOT_SENT email not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends through the Brevo API and reports the message id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ messageId: '<abc@smtp-relay>' }),
    });

    const result = await serviceWith(configured).send(EMAIL);

    expect(result).toEqual({
      delivered: true,
      result: 'SENT <abc@smtp-relay>',
    });
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(init.body)).toEqual({
      sender: { email: 'museum@example.com', name: 'BioSphere Museum' },
      to: [{ email: 'visitor@example.com', name: 'Visitor' }],
      subject: 'Subject',
      textContent: 'Text',
      htmlContent: '<p>Text</p>',
    });
  });

  it('reports a Brevo rejection without throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Key not found' }),
    });

    await expect(serviceWith(configured).send(EMAIL)).resolves.toEqual({
      delivered: false,
      result: 'FAILED 401 Key not found',
    });
  });

  it('reports a network error without throwing, within 100 characters', async () => {
    fetchMock.mockRejectedValue(new Error('x'.repeat(200)));

    const result = await serviceWith(configured).send(EMAIL);

    expect(result.delivered).toBe(false);
    expect(result.result.startsWith('FAILED ')).toBe(true);
    expect(result.result.length).toBe(100);
  });
});
