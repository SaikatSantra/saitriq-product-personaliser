# LLM & AI Processing Specifications (`_LLM.md`)

## 1. Background Removal Engine
* **Integration:** Integrated serverless container running `Rembg` (U^2-Net) or Cloud API integration (PhotoRoom/Remove.bg).
* **Workflow:** Upon image upload in storefront widget, dispatch image buffer to `/api/ai/remove-bg`. Render transparent PNG back to client canvas layer.

## 2. Face Cut-Out & Crop
* **Implementation:** MediaPipe / OpenCV face detection node. Automatically detects subject face bounding box, applies anti-aliased soft feather ellipse mask, and isolates portrait for custom merchandise (e.g., custom pattern socks or blankets).

## 3. Generative AI Art Prompting
* **Integration:** OpenAI DALL-E 3 API / Stable Diffusion API wrapper inside the customization modal.
* **Capabilities:** Shoppers enter prompt string (e.g., "Cyberpunk neon cat portrait"), backend generates vector/raster art, auto-crops to print bounds, and sets asset as active layer.
