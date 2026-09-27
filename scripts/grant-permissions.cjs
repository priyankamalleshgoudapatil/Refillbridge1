const { Client } = require('pg');

const password = 'zWZV!#wuKv#8%2P';
const projectRef = 'udoufvvarflbszclheme';

async function grant() {
  const host = 'aws-0-ap-south-1.pooler.supabase.com';
  const user = `postgres.${projectRef}`;
  const port = 6543;

  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to Postgres.');

  const sql = `
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
  `;

  await client.query(sql);
  console.log('Granted all permissions to anon, authenticated, and service_role.');
  await client.end();
}

grant().catch((err) => {
  console.error(err);
  process.exit(1);
});
