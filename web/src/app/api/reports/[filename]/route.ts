import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const REPORTS_DIR = path.join(process.cwd(), "private_reports");

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
    try {
        const { filename } = await params;
        const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const filePath = path.join(REPORTS_DIR, safeName);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ ok: false, error: "File not found" }, { status: 404 });
        }

        const fileBuffer = fs.readFileSync(filePath);

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${safeName}"`,
            },
        });

    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
    try {
        const { filename } = await params;
        const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const filePath = path.join(REPORTS_DIR, safeName);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        return NextResponse.json({ ok: true, message: "Deleted" });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
