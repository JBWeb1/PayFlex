const { customAlphabet } = require('nanoid');

// No ambiguous characters (0/O, 1/I/L) so references are easy to read out loud.
const refAlphabet = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 8);
const slugAlphabet = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

const newReference = () => `PF-${refAlphabet()}`;
const newSlug = () => slugAlphabet();

module.exports = { newReference, newSlug };
