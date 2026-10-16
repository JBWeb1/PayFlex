// Usage: node src/db/migrate.js [latest|rollback]
const db = require('./index');

const path = require('path');

const directory = path.join(__dirname, 'migrations');
const action = process.argv[2] || 'latest';

(action === 'rollback' ? db.migrate.rollback({ directory }) : db.migrate.latest({ directory }))
  .then(([, files]) => {
    console.log(files.length ? `${action}: ${files.join(', ')}` : 'Already up to date');
    return db.destroy();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
