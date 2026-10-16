const luhnValid = require('../src/utils/luhn');
const toCsv = require('../src/utils/csv');
const { validateCard } = require('../src/services/gateway');
const { formatMoney } = require('../src/utils/money');

test('luhn', () => {
  expect(luhnValid('4242424242424242')).toBe(true);
  expect(luhnValid('4242 4242 4242 4241')).toBe(false);
  expect(luhnValid('123')).toBe(false);
});

test('csv escaping and formula protection', () => {
  const csv = toCsv(
    [
      { label: 'a', value: (r) => r.a },
      { label: 'b', value: (r) => r.b },
    ],
    [{ a: 'x,y', b: 'say "hi"' }, { a: '=1+1', b: null }]
  );
  expect(csv).toBe('a,b\n"x,y","say ""hi"""\n\'=1+1,');
});

test('card validation', () => {
  const card = { name: 'A', number: '4242424242424242', expiry: '12/39', cvc: '123' };
  expect(validateCard(card)).toBeNull();
  expect(validateCard({ ...card, expiry: '01/20' })).toMatch(/expired/);
  expect(validateCard({ ...card, expiry: '13/39' })).toMatch(/month/);
  expect(validateCard({ ...card, cvc: '1' })).toMatch(/CVC/);
  expect(validateCard({ ...card, name: ' ' })).toMatch(/name/);
});

test('money formatting', () => {
  expect(formatMoney(14999)).toBe('R 149.99');
  expect(formatMoney(134950)).toBe('R 1,349.50');
});
