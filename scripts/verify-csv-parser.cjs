// Bounded synthetic parser checks only: no HTTP, AppModule, dotenv or database.
const assert = require('node:assert/strict');
const { parse } = require('csv-parse/sync');
const options = {
  columns: true,
  bom: true,
  trim: true,
  skip_empty_lines: true,
};
const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}
check('BOM, CRLF, trimmed fields and accession leading zeros', () => {
  assert.deepEqual(
    parse(
      '\uFEFFaccessionNumber, commonName\r\n000123, Synthetic beetle \r\n',
      options,
    ),
    [{ accessionNumber: '000123', commonName: 'Synthetic beetle' }],
  );
});
check('quoted comma, escaped quote and embedded newline', () => {
  assert.deepEqual(
    parse(
      'commonName,remarks\n"Beetle, synthetic","Line 1\nLine ""2"""\n',
      options,
    ),
    [{ commonName: 'Beetle, synthetic', remarks: 'Line 1\nLine "2"' }],
  );
});
check('blank lines are ignored', () => {
  assert.deepEqual(parse('commonName\n\nFirst\n\nSecond\n', options), [
    { commonName: 'First' },
    { commonName: 'Second' },
  ]);
});
check('numeric-looking and date values stay literal strings', () => {
  assert.deepEqual(
    parse('quantity,collectionDate\n00012,2020-01-01\n', options),
    [{ quantity: '00012', collectionDate: '2020-01-01' }],
  );
});
check('Unicode and hash characters remain data', () => {
  assert.deepEqual(
    parse(
      'commonName,remarks\nMa\u00f1ana \u65e5\u672c\u8a9e,#not a comment\n',
      options,
    ),
    [
      {
        commonName: 'Ma\u00f1ana \u65e5\u672c\u8a9e',
        remarks: '#not a comment',
      },
    ],
  );
});
check('unterminated quotes are rejected', () => {
  assert.throws(() => parse('commonName\n"Unclosed\n', options), {
    name: 'Error',
  });
});
check('inconsistent column counts are rejected', () => {
  assert.throws(() => parse('commonName,remarks\nOnly one\n', options), {
    name: 'Error',
  });
});
check('duplicate prototype header cannot replace the row prototype', () => {
  // This additional upstream option is intentionally NOT enabled by BioSphere.
  const [row] = parse('__proto__,__proto__,commonName\none,two,Synthetic\n', {
    ...options,
    group_columns_by_name: true,
  });
  assert.equal(Object.getPrototypeOf(row), Object.prototype);
  assert.equal(Object.hasOwn(row, '__proto__'), true);
  assert.deepEqual(row.__proto__, ['one', 'two']);
  assert.equal(row.commonName, 'Synthetic');
});
process.stdout.write(
  JSON.stringify({ passed: checks.length, checks, syntheticOnly: true }) + '\n',
);
