// Create or update the tables and views: `DATABASE_URL=... npm run db:setup`
import { open } from "./dbconn.mjs";
const db = await open();
await db.exec(db.schema);
const [r] = await db.query("select (select count(*) from samples)::int as samples, (select count(*) from contributors)::int as contributors");
console.log(`schema ready on ${db.kind}:`, r);
await db.close();
