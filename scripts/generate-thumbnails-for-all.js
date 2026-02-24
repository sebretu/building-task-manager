// Skrypt masowego generowania miniatur dla wszystkich zdjęć w bucketcie Supabase
// Ustaw dane konfiguracyjne poniżej:
const SUPABASE_URL = 'https://api.inspecthero.pl';
const SUPABASE_ANON_KEY = 'sb_publishable_mEIPEVXeo0AgU98ieyFNOQ_tp_f6XqC'; // Wstaw produkcyjny anon key z panelu Supabase
const EDGE_FUNCTION_URL = 'https://phvtrpskgupxkktbznac.functions.supabase.co/generate-thumbnail';
const BUCKET = 'task-photos';

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  // Pobierz wszystkie zdjęcia z każdego folderu (task_id) i wywołaj Edge Function
  const { data: rootFolders, error: rootFoldersError } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
  if (rootFoldersError) {
    console.error('Błąd pobierania root:', rootFoldersError);
    return;
  }
  let allFiles = [];
  for (const item of rootFolders) {
    // Pobierz pliki w folderze task_id
    const { data: subItems, error: subItemsError } = await supabase.storage.from(BUCKET).list(item.name, { limit: 1000 });
    if (subItemsError) {
      console.error(`Błąd pobierania ${item.name}:`, subItemsError);
      continue;
    }
    for (const subItem of subItems) {
      if (subItem.name.endsWith('_thumb.jpg') || subItem.name.endsWith('_thumb.webp')) continue;
      allFiles.push(`${item.name}/${subItem.name}`);
    }
  }
  if (!allFiles.length) {
    console.log('Brak plików do przetworzenia.');
    return;
  }
  for (const imagePath of allFiles) {
    try {
      const resp = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ imagePath })
      });
      const result = await resp.text();
      console.log(`Miniatura dla ${imagePath}:`, resp.status, result);
    } catch (e) {
      console.error(`Błąd dla ${imagePath}:`, e);
    }
  }
}

main();
