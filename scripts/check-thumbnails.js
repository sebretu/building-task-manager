// Skrypt sprawdzający, czy zdjęcia mają wygenerowane miniatury (thumb_url) w tabeli task_photos
const SUPABASE_URL = 'https://api.inspecthero.pl';
const SUPABASE_ANON_KEY = 'sb_publishable_mEIPEVXeo0AgU98ieyFNOQ_tp_f6XqC'; // Wstaw produkcyjny anon key z panelu Supabase

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase
    .from('task_photos')
    .select('id, storage_path, thumb_url, url')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Błąd pobierania danych:', error);
    return;
  }
  if (!data || data.length === 0) {
    console.log('Brak zdjęć w bazie.');
    return;
  }
  for (const row of data) {
    console.log(`ID: ${row.id}\n  Plik: ${row.storage_path}\n  Miniatura: ${row.thumb_url ? row.thumb_url : 'BRAK'}\n  Oryginał: ${row.url}\n`);
  }
}

main();
