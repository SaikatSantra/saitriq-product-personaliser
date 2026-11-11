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

  const fileName = `print_${orderId}_${lineItemId}.pdf`;
  const filePath = path.join(printsDir, fileName);

  // Convert pixel dimensions to PDF Points (72 points per inch) at the target DPI
  // Width (inches) = canvasWidth / printDpi
  // Width (points) = Width (inches) * 72
  const widthPoints = Math.round((canvasWidth / printDpi) * 72);
  const heightPoints = Math.round((canvasHeight / printDpi) * 72);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [widthPoints, heightPoints],
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: `Print Asset - Order #${orderId}`,
          Author: "Saitriq Product Personalizer",
          Creator: "Saitriq 300 DPI Render Engine",
        },
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // 1. Draw Bleed / Background Box
      doc
        .rect(0, 0, widthPoints, heightPoints)
        .fill("#ffffff");

      // 2. If preview snapshot base64 is provided, embed image
      if (previewBase64 && previewBase64.includes("base64,")) {
        try {
          const rawBase64 = previewBase64.split("base64,")[1];
          const imgBuffer = Buffer.from(rawBase64, "base64");
          doc.image(imgBuffer, 0, 0, {
            fit: [widthPoints, heightPoints],
            align: "center",
            valign: "center",
          });
        } catch (imgErr) {
          console.warn("[Renderer] Could not embed preview base64 image", imgErr);
        }
      }

      // 3. Render Vector Typography Overlay
      const customText = customerSelections["Custom Text"] || customerSelections["Enter Your Text"] || "";
      if (customText) {
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
