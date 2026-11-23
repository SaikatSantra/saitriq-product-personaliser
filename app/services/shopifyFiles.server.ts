import * as fs from "fs/promises";
import * as path from "path";

export interface UploadShopifyFileOptions {
  imageSource: string | Buffer;
  filename?: string;
  alt?: string;
}

/**
 * Resolves an image buffer and mime type from various formats:
 * - Raw Buffer
 * - Base64 Data URL (data:image/...)
 * - Local file path in public/uploads/previews/
 * - Relative or proxy preview URL (/apps/personalizer/preview/...)
 * - Public HTTP/HTTPS URL
 */
export async function resolveImageBufferAndMime(
  imageSource: string | Buffer,
  fallbackFilename = "preview.jpg"
): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  if (!imageSource) return null;

  try {
    // 1. Raw Buffer
    if (Buffer.isBuffer(imageSource)) {
      return {
        buffer: imageSource,
        mimeType: fallbackFilename.endsWith(".png") ? "image/png" : "image/jpeg",
        filename: fallbackFilename,
      };
    }

    const src = String(imageSource).trim();

    // 2. Base64 Data URL
    if (src.startsWith("data:image")) {
      const mimeMatch = src.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
      const mimeExt = mimeMatch ? mimeMatch[1] : "jpeg";
      const mimeType = `image/${mimeExt === "jpg" ? "jpeg" : mimeExt}`;
      const base64Data = src.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const ext = mimeExt === "jpeg" ? "jpg" : mimeExt;
      const cleanFilename = fallbackFilename.includes(".")
        ? fallbackFilename
        : `${fallbackFilename}.${ext}`;
      return { buffer, mimeType, filename: cleanFilename };
    }

    // 3. Extract filename from local or proxy path
    // e.g. /apps/personalizer/preview/cust_123.jpg or /uploads/previews/cust_123.jpg
    const match = src.match(/(?:preview|previews)\/([a-zA-Z0-9_.-]+)/);
    const candidateName = match ? match[1] : path.basename(src.split("?")[0]);

    if (candidateName && candidateName.includes(".")) {
      const localPath = path.resolve(process.cwd(), "public", "uploads", "previews", candidateName);
      try {
        const buffer = await fs.readFile(localPath);
        const mimeType = candidateName.endsWith(".png")
          ? "image/png"
          : candidateName.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
        return { buffer, mimeType, filename: candidateName };
      } catch {
        // Not found locally, continue to fetch if http
      }
    }

    // 4. Remote HTTP/HTTPS URL
    if (src.startsWith("http://") || src.startsWith("https://")) {
      const resp = await fetch(src);
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        const buffer = Buffer.from(ab);
        const contentType = resp.headers.get("content-type") || "image/jpeg";
        const cleanName = candidateName || fallbackFilename;
        return { buffer, mimeType: contentType, filename: cleanName };
      }
    }
  } catch (err) {
    console.warn("[ShopifyFiles] Could not resolve image buffer:", err);
  }

  return null;
}

/**
 * Uploads an image directly to Shopify Files (Shopify Admin Content > Files)
 * via stagedUploadsCreate and fileCreate GraphQL mutations.
 * Returns the permanent cdn.shopify.com URL.
 */
export async function uploadToShopifyFiles(
  admin: any,
  options: UploadShopifyFileOptions
): Promise<string | null> {
  if (!admin?.graphql) {
    console.warn("[ShopifyFiles] Admin GraphQL client not provided, skipping Shopify Files upload.");
    return null;
  }

  const resolved = await resolveImageBufferAndMime(
    options.imageSource,
    options.filename || `preview_${Date.now()}.jpg`
  );

  if (!resolved || !resolved.buffer || resolved.buffer.length === 0) {
    console.warn("[ShopifyFiles] Failed to obtain image buffer for upload.");
    return null;
  }

  const { buffer, mimeType, filename } = resolved;
  const altText = options.alt || `Order Preview ${filename}`;

  try {
    // Step 1: Create Staged Upload Target
    const stagedUploadMutation = `#graphql
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const stagedRes = await admin.graphql(stagedUploadMutation, {
      variables: {
        input: [
          {
            filename,
            mimeType,
            httpMethod: "POST",
            resource: "IMAGE",
            fileSize: buffer.length.toString(),
          },
        ],
      },
    });

    const stagedJson = await stagedRes.json();
    const userErrors = stagedJson?.data?.stagedUploadsCreate?.userErrors || [];
    if (userErrors.length > 0) {
      console.warn("[ShopifyFiles] stagedUploadsCreate userErrors:", userErrors);
      return null;
    }

    const stagedTarget = stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!stagedTarget || !stagedTarget.url) {
      console.warn("[ShopifyFiles] No staged target returned by Shopify.");
      return null;
    }

    // Step 2: Multipart Form POST to Shopify Staged Target
    const formData = new FormData();
    for (const param of stagedTarget.parameters || []) {
      formData.append(param.name, param.value);
    }

    // Append file as blob (MUST be appended after the parameters)
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append("file", blob, filename);

    const uploadPostRes = await fetch(stagedTarget.url, {
      method: "POST",
      body: formData,
    });

    if (!uploadPostRes.ok && uploadPostRes.status !== 201 && uploadPostRes.status !== 204) {
      const errText = await uploadPostRes.text().catch(() => "");
      console.warn(
        `[ShopifyFiles] Upload to staged target failed with status ${uploadPostRes.status}:`,
        errText
      );
      return null;
    }

    // Step 3: Call fileCreate to register the uploaded file into Content > Files
    const fileCreateMutation = `#graphql
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            alt
            createdAt
            ... on MediaImage {
              image {
                url
              }
            }
            ... on GenericFile {
              url
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const fileCreateRes = await admin.graphql(fileCreateMutation, {
      variables: {
        files: [
          {
            originalSource: stagedTarget.resourceUrl,
            contentType: "IMAGE",
            alt: altText,
          },
        ],
      },
    });

    const fileCreateJson = await fileCreateRes.json();
    const createErrors = fileCreateJson?.data?.fileCreate?.userErrors || [];
    if (createErrors.length > 0) {
      console.warn("[ShopifyFiles] fileCreate userErrors:", createErrors);
      return stagedTarget.resourceUrl || null;
    }

    const fileNode = fileCreateJson?.data?.fileCreate?.files?.[0];
    if (!fileNode) {
      return stagedTarget.resourceUrl || null;
    }

    // Check if CDN URL is returned immediately
    let cdnUrl = fileNode.image?.url || fileNode.url || "";
    if (cdnUrl) {
      console.log(`[ShopifyFiles] File uploaded successfully to Shopify Files: ${cdnUrl}`);
      return cdnUrl;
    }

    // Step 4: Quick polling if status is PROCESSING (up to 3 checks, 600ms apart)
    if (fileNode.id && (fileNode.fileStatus === "PROCESSING" || !cdnUrl)) {
      const fileId = fileNode.id;
      const fileStatusQuery = `#graphql
        query getFileStatus($id: ID!) {
          node(id: $id) {
            ... on MediaImage {
              fileStatus
              image {
                url
              }
            }
            ... on GenericFile {
              fileStatus
              url
            }
          }
        }
      `;

      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 600));
        try {
          const pollRes = await admin.graphql(fileStatusQuery, { variables: { id: fileId } });
          const pollJson = await pollRes.json();
          const node = pollJson?.data?.node;
          const polledUrl = node?.image?.url || node?.url || "";
          if (polledUrl) {
            console.log(`[ShopifyFiles] File ready on Shopify CDN: ${polledUrl}`);
            return polledUrl;
          }
        } catch {
          // ignore polling error and retry
        }
      }
    }

    return stagedTarget.resourceUrl || null;
  } catch (error) {
    console.error("[ShopifyFiles] Error saving preview to Shopify Files:", error);
    return null;
  }
}
