const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const password = 'zWZV!#wuKv#8%2P';
const projectRef = 'udoufvvarflbszclheme';

// Supabase pooler regions (using .com)
const regions = [
  'ap-south-1', // Mumbai (India - likely given local timezone GMT+5:30)
  'ap-southeast-1', // Singapore
  'us-east-1', // N. Virginia
  'us-west-1', // N. California
  'eu-central-1', // Frankfurt
  'eu-west-1', // Ireland
  'eu-west-2', // London
  'sa-east-1', // São Paulo
  'ca-central-1', // Central Canada
  'ap-northeast-1', // Tokyo
  'ap-northeast-2', // Seoul
  'ap-southeast-2', // Sydney
];

async function tryConnect(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const user = `postgres.${projectRef}`;
  const port = 6543; // Transaction pooler (or 5432 for session)
  console.log(`Connecting to ${host}:${port} as ${user}...`);

  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log(`>>> Connected successfully to ${region} pooler!`);
    return client;
  } catch (err) {
    console.log(`Failed ${region}: ${err.message}`);
    await client.end().catch(() => {});
    return null;
  }
}

async function run() {
  let client = null;
  for (const reg of regions) {
    client = await tryConnect(reg);
    if (client) break;
  }

  if (!client) {
    console.error('Could not connect to any regional pooler.');
    process.exit(1);
  }

  console.log('Reading supabase/schema.sql...');
  const sql = fs.readFileSync(path.resolve(__dirname, '../supabase/schema.sql'), 'utf8');

  console.log('Executing schema and seed SQL on Supabase Postgres...');
  await client.query(sql);

  console.log('SQL execution completed successfully!');

  // Verify counts
  const tables = [
    'organizations', 'users', 'patients', 'prescriptions', 
    'encounters', 'observations', 'practice_policies', 'pharmacy_links', 
    'cases', 'case_events', 'case_notes', 'case_tasks'
  ];
  for (const t of tables) {
    const res = await client.query(`SELECT COUNT(*) FROM ${t}`);
    console.log(`Table ${t}: ${res.rows[0].count} rows`);
  }

  await client.end();
  console.log('All done!');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
