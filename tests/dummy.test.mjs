import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['src/dummy.ts'], bundle: true, format: 'esm', write: false, platform: 'node' });
const { createDummyText } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const count = text => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length;

test('dummy email keeps its length and separators while changing every letter', () => {
  const source = 'alex@example.com';
  const dummy = createDummyText(source);
  assert.equal(dummy.length, source.length);
  assert.equal(count(dummy), count(source));
  for (let index = 0; index < source.length; index++) {
    if (/[a-z0-9]/i.test(source[index])) assert.notEqual(dummy[index], source[index]);
    else assert.equal(dummy[index], source[index]);
  }
});

test('dummy text keeps the visible character count for symbols and emoji', () => {
  const source = 'A9! 👩‍💻';
  const dummy = createDummyText(source);
  assert.equal(count(dummy), count(source));
  assert.equal(dummy[3], ' ');
  assert.notEqual(dummy, source);
});

test('dummy generation is referentially consistent (identical inputs yield identical scrambled text)', () => {
  const source1 = 'alex@example.com';
  const source2 = 'alex@example.com';
  const diffSource = 'sam@demo.test';

  const dummy1 = createDummyText(source1);
  const dummy2 = createDummyText(source2);
  const dummyDiff = createDummyText(diffSource);

  assert.equal(dummy1, dummy2);
  assert.notEqual(dummy1, dummyDiff);
  assert.equal(dummy1.length, source1.length);
});

