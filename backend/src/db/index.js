const fs = require('fs');
const path = require('path');
const knex = require('knex');
const config = require('../config');

const isPostgres = /^postgres(ql)?:\/\//.test(config.databaseUrl);

function sqliteConfig() {
  const file = config.sqliteFile;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  return {
    client: 'better-sqlite3',
    connection: { filename: file },
    useNullAsDefault: true,
    // better-sqlite3 is synchronous; one connection also keeps :memory: databases alive.
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn, done) => {
        conn.pragma('foreign_keys = ON');
        conn.pragma('journal_mode = WAL');
        done();
      },
    },
  };
}

const db = knex(
  isPostgres
    ? { client: 'pg', connection: config.databaseUrl, pool: { min: 0, max: 10 } }
    : sqliteConfig()
);

db.isPostgres = isPostgres;

db.migrateLatest = () => db.migrate.latest({ directory: path.join(__dirname, 'migrations') });

module.exports = db;
