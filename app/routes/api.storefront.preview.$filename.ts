import type { LoaderFunctionArgs } from "react-router";
import * as fs from "fs/promises";
import * as path from "path";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const filename = (params.filename || "").replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!filename) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.resolve(process.cwd(), "public", "uploads", "previews", filename);

  try {
    const fileBuffer = await fs.readFile(filePath);
    const contentType = filename.endsWith(".png") ? "image/png" : "image/jpeg";

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Preview image not found", { status: 404 });
  }
};
