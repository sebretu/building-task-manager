require("dotenv").config({ path: "web/.env.local" });
const { createClient } = require("@supabase/supabase-js");

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from("task_history").select("id, action, changed_by, created_at, task_id").order("created_at", { ascending: false }).limit(20);
  console.log(error ? error : JSON.stringify(data, null, 2));
}
run();
