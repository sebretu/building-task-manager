// Supabase Edge Function: generate-thumbnail
// Deno runtime (Supabase Edge Functions)
// Requires: deno.land/x/image@0.40.0 (or similar)
// This function generates a thumbnail for a given image in Supabase Storage
// and saves it to a 'task-photos-thumbs' bucket.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

serve(async (req) => {
  const { imagePath, bucket = "task-photos", thumbBucket = "task-photos", width = 200, height = 200 } = await req.json();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Download original image
  const { data: origData, error: origErr } = await supabase.storage.from(bucket).download(imagePath);
  if (origErr || !origData) {
    return new Response(JSON.stringify({ error: "Failed to download original image", details: origErr }), { status: 400 });
  }

  // Read image buffer
  const origBuffer = await origData.arrayBuffer();
  let image;
  try {
    image = await Image.decode(new Uint8Array(origBuffer));
  } catch (e) {
    return new Response(JSON.stringify({ error: "Failed to decode image", details: e.message }), { status: 400 });
  }

  // Resize
  image = image.resize(width, height);
  const thumbBufferJpg = await image.encodeJPEG(80);
  const thumbBufferWebp = await image.encodeWEBP(80);

  // Save thumbnail JPG
  const thumbPathJpg = imagePath.replace(/^(.+)(\.[^.]+)$/, "$1-thumb.jpg");
  const { error: uploadErrJpg } = await supabase.storage.from(thumbBucket).upload(thumbPathJpg, thumbBufferJpg, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (uploadErrJpg) {
    return new Response(JSON.stringify({ error: "Failed to upload thumbnail JPG", details: uploadErrJpg }), { status: 400 });
  }

  // Save thumbnail WEBP
  const thumbPathWebp = imagePath.replace(/^(.+)(\.[^.]+)$/, "$1-thumb.webp");
  const { error: uploadErrWebp } = await supabase.storage.from(thumbBucket).upload(thumbPathWebp, thumbBufferWebp, {
    contentType: "image/webp",
    upsert: true,
  });
  if (uploadErrWebp) {
    return new Response(JSON.stringify({ error: "Failed to upload thumbnail WEBP", details: uploadErrWebp }), { status: 400 });
  }

  // Return thumbnail URLs
  const thumbUrlJpg = `${supabaseUrl}/storage/v1/object/public/${thumbBucket}/${thumbPathJpg}`;
  const thumbUrlWebp = `${supabaseUrl}/storage/v1/object/public/${thumbBucket}/${thumbPathWebp}`;
  return new Response(JSON.stringify({ thumbUrl: thumbUrlJpg, thumbUrlWebp }), { status: 200 });
});
