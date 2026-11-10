import { detectFaqSmallTalk, stripLeadingGreeting } from './faq-small-talk';

describe('FAQ small talk', () => {
  it('recognizes greetings, thanks, goodbyes and help requests', () => {
    expect(detectFaqSmallTalk('Hello')).toBe('GREETING');
    expect(detectFaqSmallTalk('hi there!')).toBe('GREETING');
    expect(detectFaqSmallTalk('Good morning po')).toBe('GREETING');
    expect(detectFaqSmallTalk('Maayong buntag')).toBe('GREETING');
    expect(detectFaqSmallTalk('Thank you so much!')).toBe('THANKS');
    expect(detectFaqSmallTalk('salamat')).toBe('THANKS');
    expect(detectFaqSmallTalk('Bye')).toBe('GOODBYE');
    expect(detectFaqSmallTalk('What can you do?')).toBe('HELP');
  });

  it('leaves real questions alone', () => {
    expect(detectFaqSmallTalk('Hello, where is the museum?')).toBeNull();
    expect(detectFaqSmallTalk('Museum where')).toBeNull();
    expect(detectFaqSmallTalk('Is there a hi-fi audio guide?')).toBeNull();
    expect(detectFaqSmallTalk('Thanks, how much is admission?')).toBeNull();
    expect(detectFaqSmallTalk('')).toBeNull();
  });

  it('strips only a leading greeting before matching', () => {
    expect(stripLeadingGreeting('Hello, where is the museum?')).toBe(
      'where is the museum',
    );
    expect(stripLeadingGreeting('Hi there how much is admission')).toBe(
      'how much is admission',
    );
    expect(stripLeadingGreeting('Where is the museum?')).toBe(
      'Where is the museum?',
    );
    expect(stripLeadingGreeting('Hello')).toBe('Hello');
  });
});
