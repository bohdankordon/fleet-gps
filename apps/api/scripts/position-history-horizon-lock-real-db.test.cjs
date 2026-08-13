const assert = require("node:assert/strict");
const test = require("node:test");
const { Client } = require("pg");

const LOCK_KEY = 1706170003;

test("two independent PostgreSQL sessions serialize horizon population lock ownership", async () => {
  const first = new Client({ connectionString: process.env.DATABASE_URL });
  const second = new Client({ connectionString: process.env.DATABASE_URL });
  let firstOwns = false;
  let secondOwns = false;
  try {
    await first.connect();
    await second.connect();
    firstOwns = (await first.query("SELECT pg_try_advisory_lock($1) AS acquired", [LOCK_KEY])).rows[0].acquired;
    assert.equal(firstOwns, true);
    assert.equal((await second.query("SELECT pg_try_advisory_lock($1) AS acquired", [LOCK_KEY])).rows[0].acquired, false);
    assert.equal((await first.query("SELECT pg_advisory_unlock($1) AS released", [LOCK_KEY])).rows[0].released, true);
    firstOwns = false;
    secondOwns = (await second.query("SELECT pg_try_advisory_lock($1) AS acquired", [LOCK_KEY])).rows[0].acquired;
    assert.equal(secondOwns, true);
  } finally {
    if (firstOwns) try { await first.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]); } catch {}
    if (secondOwns) try { await second.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]); } catch {}
    await Promise.allSettled([first.end(), second.end()]);
  }
});
