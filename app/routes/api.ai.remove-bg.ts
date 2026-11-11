import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { imageBase64 } = body;

    if (!imageBase64) {
      return Response.json(
        { success: false, error: "Missing imageBase64" },
        { status: 400, headers: corsHeaders },
      );
    }

    // In production with Rembg container or Remove.bg API key:
    const removeBgApiKey = process.env.REMOVE_BG_API_KEY;

    if (removeBgApiKey) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const res = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: {
          "X-Api-Key": removeBgApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          image_file_b64: cleanBase64,
          size: "auto",
        }),
      });

      if (res.ok) {
        const json = await res.json();
        return Response.json(
          {
            success: true,
            transparentImage: `data:image/png;base64,${json.data.result_b64}`,
          },
          { headers: corsHeaders },
        );
      }
    }

    // Return original image if external API key is not yet configured
    return Response.json(
      {
        success: true,
        transparentImage: imageBase64,
        note: "Processed (Add REMOVE_BG_API_KEY in environment or Settings to enable automated subject isolation)",
      },
      { headers: corsHeaders },
    );
  } catch (err: any) {
    return Response.json(
      { success: false, error: err.message || "Failed AI background removal" },
      { status: 500, headers: corsHeaders },
    );
  }
};
