// Dates are stored as ISO-8601 strings in SQLite and timestamptz in PostgreSQL;
// the repositories always write ISO strings so comparisons work on both.
exports.up = async (knex) => {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('name', 80).notNullable();
    t.string('email', 255).notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('role', 16).notNullable().defaultTo('merchant');
    t.string('status', 16).notNullable().defaultTo('active');
    t.string('business_name', 120).notNullable().defaultTo('');
    t.string('webhook_url', 2048).notNullable().defaultTo('');
    t.string('webhook_secret', 80).notNullable();
    t.boolean('notify_on_payment').notNullable().defaultTo(true);
    t.timestamp('last_login_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable();
    t.timestamp('updated_at', { useTz: true }).notNullable();
  });

  await knex.schema.createTable('payments', (t) => {
    t.increments('id').primary();
    t.integer('merchant_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('amount').notNullable(); // cents
    t.string('currency', 3).notNullable();
    t.string('description', 200).notNullable().defaultTo('');
    t.string('reference', 20).notNullable().unique();
    t.string('slug', 32).notNullable().unique();
    t.string('status', 24).notNullable().defaultTo('pending');
    t.string('payer_name', 80).notNullable().defaultTo('');
    t.string('payer_email', 255).notNullable().defaultTo('');
    t.string('redirect_url', 2048).notNullable().defaultTo('');
    t.timestamp('expires_at', { useTz: true });
    t.timestamp('paid_at', { useTz: true });
    t.string('method', 8);
    t.string('transaction_id', 64);
    t.string('card_last4', 4);
    t.integer('failed_attempts').notNullable().defaultTo(0);
    t.integer('refunded_amount').notNullable().defaultTo(0); // cents
    t.timestamp('refunded_at', { useTz: true });
    t.timestamp('cancelled_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable();
    t.timestamp('updated_at', { useTz: true }).notNullable();
    t.index(['merchant_id', 'created_at']);
    t.index(['status', 'expires_at']);
    t.index(['paid_at']);
  });

  await knex.schema.createTable('payment_events', (t) => {
    t.increments('id').primary();
    t.integer('payment_id').notNullable().references('id').inTable('payments').onDelete('CASCADE');
    t.string('type', 40).notNullable();
    t.string('message', 255).notNullable().defaultTo('');
    t.timestamp('created_at', { useTz: true }).notNullable();
    t.index(['payment_id']);
  });

  await knex.schema.createTable('webhook_deliveries', (t) => {
    t.increments('id').primary();
    t.integer('merchant_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('payment_id').references('id').inTable('payments').onDelete('CASCADE');
    t.string('event', 40).notNullable();
    t.string('url', 2048).notNullable();
    t.integer('attempt').notNullable().defaultTo(1);
    t.boolean('success').notNullable().defaultTo(false);
    t.integer('status_code');
    t.string('error', 255);
    t.integer('duration_ms');
    t.timestamp('created_at', { useTz: true }).notNullable();
    t.index(['payment_id']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('webhook_deliveries');
  await knex.schema.dropTableIfExists('payment_events');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('users');
};
