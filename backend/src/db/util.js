const nowIso = () => new Date().toISOString();

// pg returns Date objects, SQLite returns the stored ISO string.
const iso = (value) => (value ? new Date(value).toISOString() : null);

// pg returns COUNT/SUM as strings.
const num = (value) => Number(value || 0);

// Portable, case-insensitive "contains" across several columns.
function whereContains(query, columns, text) {
  const needle = `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return query.where((qb) => {
    for (const col of columns) qb.orWhereRaw(`lower(??) like ? escape '\\'`, [col, needle]);
  });
}

function camelToRow(patch, fields) {
  const row = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && fields[key]) row[fields[key]] = value;
  }
  return row;
}

module.exports = { nowIso, iso, num, whereContains, camelToRow };
