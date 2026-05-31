import { readFileSync, writeFileSync } from 'node:fs';

const required = ['CLOUDFLARE_D1_DATABASE_NAME', 'CLOUDFLARE_D1_DATABASE_ID'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`${key} is required to generate wrangler.toml`);
  }
}

const config = readFileSync('wrangler.example.toml', 'utf8')
  .replace('REPLACE_WITH_D1_DATABASE_NAME', process.env.CLOUDFLARE_D1_DATABASE_NAME)
  .replace('REPLACE_WITH_D1_DATABASE_ID', process.env.CLOUDFLARE_D1_DATABASE_ID);

writeFileSync('wrangler.toml', config);
console.log('Generated wrangler.toml from wrangler.example.toml');
