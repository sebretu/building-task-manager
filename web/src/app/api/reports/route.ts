import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = 'force-dynamic';

const REPORTS_DIR = path.join(process.cwd(), "private_reports");

// Ensure directory exists
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

export async function GET(req: NextRequest) {
    try {
        const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith(".pdf"));

        // Get stats for sorting
        const fileStats = files.map(file => {
            const filePath = path.join(REPORTS_DIR, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                created_at: stats.birthtime,
                size: stats.size
            };
        });

        // Sort by newest first
        fileStats.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

        return NextResponse.json({ ok: true, data: fileStats });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get('content-type') || '';
        if (contentType.startsWith('multipart/form-data')) {
            // --- Handle FormData (file upload) ---
            // Parse multipart (no native support in Next.js API routes, so use workaround)
            // Read raw body
            const boundaryMatch = contentType.match(/boundary=(.*)$/);
            if (!boundaryMatch) {
                return NextResponse.json({ ok: false, error: "Missing boundary in multipart/form-data" }, { status: 400 });
            }
            const boundary = boundaryMatch[1];
            const raw = Buffer.from(await req.arrayBuffer());
            // Minimal multipart parser (only for single file and filename field)
            const parts = raw.toString().split(`--${boundary}`);
            let fileBuffer = null;
            let filename = null;
            for (const part of parts) {
                if (part.includes('Content-Disposition: form-data;') && part.includes('filename=')) {
                    // File part
                    const match = part.match(/filename="([^"]+)"/);
                    if (match) filename = match[1];
                    const fileStart = part.indexOf('\r\n\r\n');
                    if (fileStart !== -1) {
                        fileBuffer = Buffer.from(part.slice(fileStart + 4, part.lastIndexOf('\r\n')));
                    }
                }
            }
            if (!filename || !fileBuffer) {
                return NextResponse.json({ ok: false, error: "Missing file or filename in multipart" }, { status: 400 });
            }
            // Basic sanitization
            const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
            const filePath = path.join(REPORTS_DIR, safeName);
            fs.writeFileSync(filePath, fileBuffer);
            return NextResponse.json({ ok: true, message: "Saved (FormData)" });
        } else {
            // --- Handle JSON (base64) ---
            const body = await req.json();
            const { filename, base64 } = body;
            if (!filename || !base64) {
                return NextResponse.json({ ok: false, error: "Missing filename or base64" }, { status: 400 });
            }
            // Basic sanitization
            const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
            const filePath = path.join(REPORTS_DIR, safeName);
            // Write file
            const buffer = Buffer.from(base64, "base64");
            fs.writeFileSync(filePath, buffer);
            return NextResponse.json({ ok: true, message: "Saved" });
        }
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
