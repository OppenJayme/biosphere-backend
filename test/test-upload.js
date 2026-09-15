// test-upload.js
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const exhibitId = 'REAL_EXHIBIT_UUID_HERE';
  const filePath = path.join(__dirname, 'fake-model.glb');

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_DEVELOPER_EMAIL,
    password: process.env.TEST_DEVELOPER_PASSWORD,
  });

  if (error || !data.session?.access_token) {
    throw new Error(`Developer login failed: ${error?.message}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();

  form.append(
    'file',
    new Blob([fileBuffer], { type: 'model/gltf-binary' }),
    'fake-model.glb',
  );
  form.append('exhibitId', exhibitId);
  form.append('modelFormat', 'glb');
  form.append('isEnabled', 'false');

  const response = await fetch('http://localhost:3000/developer/ar-assets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: form,
  });

  const body = await response.json();

  console.log('Status:', response.status);
  console.log(JSON.stringify(body, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});