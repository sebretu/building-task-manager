import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
  format?: string;
  limits?: Record<string, { maxX: number; maxY: number }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await ctx.params;

    // Zakładam, że masz meta.json w: public/tiles/<planId>/meta.json
    // (bo w PlanViewer fetchujesz `/tiles/${planId}/meta.json`)
    const metaPath = path.join(process.cwd(), "public", "tiles", planId, "meta.json");

    let raw: string;
    try {
      raw = await fs.readFile(metaPath, "utf8");
    } catch {
      return jsonError(`Brak meta.json: ${metaPath}`, 404);
    }

    let meta: Meta;
    try {
      meta = JSON.parse(raw) as Meta;
    } catch {
      return jsonError("meta.json jest uszkodzony (niepoprawny JSON)", 500);
    }

    // minimalna walidacja
    if (
      typeof meta?.tileSize !== "number" ||
      typeof meta?.minZoom !== "number" ||
      typeof meta?.maxZoom !== "number" ||
      typeof meta?.gridW !== "number" ||
      typeof meta?.gridH !== "number"
    ) {
      return jsonError("meta.json ma zły format (brakuje pól)", 500);
    }

    return NextResponse.json(meta, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error(e);
    return jsonError(e?.message ?? "Błąd serwera", 500);
  }
}
