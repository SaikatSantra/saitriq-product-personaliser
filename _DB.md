# Database Schema Design (`_DB.md`)

```sql
-- Shops Table (Multi-Tenant Core)
CREATE TABLE shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopify_domain VARCHAR(255) UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    plan_name VARCHAR(50) DEFAULT 'trial',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products Associated with Customization Templates
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    shopify_product_id BIGINT NOT NULL,
    shopify_variant_id BIGINT,
    template_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Template Master Definition
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    canvas_width INT NOT NULL,  -- in pixels or mm
    canvas_height INT NOT NULL, -- in pixels or mm
    print_dpi INT DEFAULT 300,
    layers_json JSONB NOT NULL, -- Array of Fabric.js layer state objects
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Option Groups (UI Inputs on Storefront)
CREATE TABLE option_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    display_type VARCHAR(50) NOT NULL, -- 'text_input', 'image_upload', 'swatch', 'dropdown', 'clipart'
    position INT DEFAULT 0,
    conditional_rules JSONB DEFAULT '{}'
);

-- Individual Option Items
CREATE TABLE options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES option_groups(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    price_extra DECIMAL(10,2) DEFAULT 0.00,
    metadata JSONB DEFAULT '{}'
);

-- Customized Orders Queue & Storage
CREATE TABLE customized_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    shopify_order_id BIGINT NOT NULL,
    shopify_line_item_id BIGINT NOT NULL,
    customer_selections JSONB NOT NULL,
    preview_image_url TEXT NOT NULL,
    print_file_url TEXT,
    fulfillment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_shops_domain ON shops(shopify_domain);
CREATE INDEX idx_products_shopify_id ON products(shopify_product_id);
CREATE INDEX idx_customized_orders_order_id ON customized_orders(shopify_order_id);
```
