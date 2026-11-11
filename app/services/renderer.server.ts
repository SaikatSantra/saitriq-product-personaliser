import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export interface RenderPrintOptions {
  orderId: string;
  lineItemId: string;
  canvasWidth?: number;
  canvasHeight?: number;
  printDpi?: number;
  customerSelections: Record<string, any>;
  previewBase64?: string;
}

export async function renderHighResPrintFile(options: RenderPrintOptions): Promise<string> {
  const {
    orderId,
    lineItemId,
    canvasWidth = 1200,
    canvasHeight = 1200,
    printDpi = 300,
    customerSelections,
    previewBase64,
  } = options;

  // Ensure public/prints directory exists
  const publicDir = path.resolve(process.cwd(), "public");
  const printsDir = path.resolve(publicDir, "prints");
  if (!fs.existsSync(printsDir)) {
    fs.mkdirSync(printsDir, { recursive: true });
  }

  const cleanOrderId = String(orderId).replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanLineId = String(lineItemId).replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `print_${cleanOrderId}_${cleanLineId}.pdf`;
  const filePath = path.join(printsDir, fileName);

  // Convert pixel dimensions to PDF Points (72 points per inch) at the target DPI
  const widthPoints = Math.round((canvasWidth / printDpi) * 72);
  const heightPoints = Math.round((canvasHeight / printDpi) * 72);

  // Resolve image buffer from base64, local file, or remote URL
  let imgBuffer: Buffer | null = null;
  if (previewBase64) {
    try {
      if (previewBase64.includes("base64,")) {
        const rawBase64 = previewBase64.split("base64,")[1];
        imgBuffer = Buffer.from(rawBase64, "base64");
      } else if (previewBase64.includes("/uploads/previews/") || previewBase64.includes("/preview/")) {
        const previewFilename = previewBase64.split("/").pop()?.split("?")[0];
        if (previewFilename) {
          const localPath = path.resolve(process.cwd(), "public", "uploads", "previews", previewFilename);
          if (fs.existsSync(localPath)) {
            imgBuffer = fs.readFileSync(localPath);
          }
        }
      }
      if (!imgBuffer && previewBase64.startsWith("http")) {
        const res = await fetch(previewBase64);
        if (res.ok) {
          const ab = await res.arrayBuffer();
          imgBuffer = Buffer.from(ab);
        }
      }
    } catch (loadErr) {
      console.warn("[Renderer] Could not load image for embedding:", loadErr);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [widthPoints, heightPoints],
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: `Print Asset - Order #${cleanOrderId}`,
          Author: "Saitriq Product Personalizer",
          Creator: "Saitriq 300 DPI Render Engine",
        },
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // 1. Draw Bleed / Background Box
      doc.rect(0, 0, widthPoints, heightPoints).fill("#ffffff");

      // 2. Embed image if loaded
      if (imgBuffer) {
        try {
          doc.image(imgBuffer, 0, 0, {
            fit: [widthPoints, heightPoints],
            align: "center",
            valign: "center",
          });
        } catch (imgErr) {
          console.warn("[Renderer] Error embedding image into PDF:", imgErr);
        }
      }

      // 3. Render Vector Typography Overlay (if custom text exists)
      const customText =
        customerSelections["Front Custom Text"] ||
        customerSelections["Custom Text"] ||
        customerSelections["Enter Your Text"] ||
        "";

      if (customText && !imgBuffer) {
        doc
          .fillColor("#111111")
          .fontSize(Math.max(16, Math.round(widthPoints * 0.08)))
          .text(String(customText), 0, heightPoints * 0.45, {
            width: widthPoints,
            align: "center",
          });
      }

      doc.end();

      writeStream.on("finish", () => {
        resolve(`/prints/${fileName}`);
      });

      writeStream.on("error", (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}
