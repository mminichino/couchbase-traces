import {
  BodyCapture,
  MAX_BYTES,
  redactForm,
  redactJson,
  responseHasNoBody,
} from '../body/rules';

describe('redactJson', () => {
  it.each([
    ['{"password":"x","user":"u"}', '{"password":"[REDACTED]","user":"u"}'],
    ['{"API-Key" : 12, "n": 1}', '{"API-Key" : "[REDACTED]", "n": 1}'],
    [
      '{"session":{"id":1,"a":[1,2]},"ok":true}',
      '{"session":"[REDACTED]","ok":true}',
    ],
    [
      '{"nested":{"accessToken":"t"}}',
      '{"nested":{"accessToken":"[REDACTED]"}}',
    ],
    // A key escaped in the JSON still matches.
    ['{"pass\\u0077ord":"x"}', '{"pass\\u0077ord":"[REDACTED]"}'],
  ])('redacts %s', (input, expected) => {
    expect(redactJson(input)).toBe(expected);
  });

  it('redacts JSON encoded in a string value one level deep', () => {
    const inner = JSON.stringify({ token: 't', a: 1 });
    expect(redactJson(JSON.stringify({ body: inner }))).toBe(
      JSON.stringify({ body: '{"token":"[REDACTED]","a":1}' }),
    );
  });

  it('redacts a value the cap cut off', () => {
    expect(redactJson('{"a":1,"secret":"abc')).toBe(
      '{"a":1,"secret":"[REDACTED]"',
    );
  });

  it('leaves text without sensitive keys alone', () => {
    const text = '{"a":"password","b":[1,"x"]}';
    expect(redactJson(text)).toBe(text);
  });
});

describe('redactForm', () => {
  it('redacts sensitive form keys, decoding them first', () => {
    expect(redactForm('user=u&pass%77ord=p&my+token=t&flag')).toBe(
      'user=u&pass%77ord=[REDACTED]&my+token=[REDACTED]&flag',
    );
  });
});

describe('responseHasNoBody', () => {
  it.each([
    ['HEAD', 200, true],
    ['GET', 204, true],
    ['GET', 304, true],
    ['GET', 101, true],
    ['GET', 200, false],
    [undefined, undefined, false],
  ])('%s %s -> %s', (method, status, expected) => {
    expect(responseHasNoBody(method, status)).toBe(expected);
  });
});

describe('BodyCapture', () => {
  const json = { contentType: 'application/json', contentEncoding: undefined };

  it('records size and redacted content for a JSON body', () => {
    const capture = new BodyCapture();
    capture.add(Buffer.from('{"password":'));
    capture.add('"x"}', 'utf8');
    expect(
      capture.attributes('request', {
        ...json,
        contentLength: '16',
        complete: true,
      }),
    ).toEqual({
      'http.request.body.size': 16,
      'http.request.body.content': '{"password":"[REDACTED]"}',
    });
  });

  it('keeps 8 KiB, counts every byte, and does not split a code point', () => {
    const capture = new BodyCapture();
    capture.add('€'.repeat(5000));
    const attrs = capture.attributes('response', {
      ...json,
      contentType: 'text/plain',
      contentLength: undefined,
      complete: false,
    });
    expect(attrs['http.response.body.size']).toBe(15000);
    const content = attrs['http.response.body.content'] as string;
    expect(Buffer.byteLength(content)).toBeLessThanOrEqual(MAX_BYTES);
    expect(content).toBe('€'.repeat(Math.floor(MAX_BYTES / 3)));
  });

  it('records only the size of compressed or binary bodies', () => {
    for (const meta of [
      { contentType: 'application/json', contentEncoding: 'gzip' },
      { contentType: 'image/png', contentEncoding: undefined },
      { contentType: 'text/plain; charset=latin1', contentEncoding: undefined },
      { contentType: 'multipart/form-data', contentEncoding: undefined },
    ]) {
      const capture = new BodyCapture();
      capture.add(Buffer.from('abc'));
      expect(
        capture.attributes('request', {
          ...meta,
          contentLength: '3',
          complete: true,
        }),
      ).toEqual({ 'http.request.body.size': 3 });
    }
  });

  it('records nothing for an empty body', () => {
    expect(
      new BodyCapture().attributes('request', {
        ...json,
        contentLength: '0',
        complete: true,
      }),
    ).toEqual({});
  });

  it('counts seen bytes when the body was cut short', () => {
    const capture = new BodyCapture();
    capture.add('abc');
    expect(
      capture.attributes('request', {
        contentType: 'text/plain',
        contentEncoding: undefined,
        contentLength: '100',
        complete: false,
      })['http.request.body.size'],
    ).toBe(3);
  });
});
