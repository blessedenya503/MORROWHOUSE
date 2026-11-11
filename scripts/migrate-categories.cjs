require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const productCategoryMapping = {
  // Organization & Storage (8 products)
  '1876832935276871682': 'Organization & Storage', // Laundry Basket 3-tier Laundry Sorter
  '01529AB6-745B-46AF-990C-6620913EECCD': 'Organization & Storage', // Laundry Basket
  '1979450911207059457': 'Organization & Storage', // Foldable Laundry Hampers
  '1990445023500742658': 'Organization & Storage', // Round Laundry Basket Natural
  '2003340141638103042': 'Organization & Storage', // Laundry Hamper Cabinet
  '2609211432561636900': 'Organization & Storage', // Laundry Basket For Home Use Laundry Storage Bin
  '1867039855201898496': 'Organization & Storage', // 3 Rows And 9 Layers Shoe Racks
  '2067432169405059074': 'Organization & Storage', // Storage Bed Upholstered Bed Hydraulic Double Bed

  // Bedroom & Comfort (11 products)
  '1990534185382240257': 'Bedroom & Comfort', // Children's Bed House Bed
  '2067163056487194626': 'Bedroom & Comfort', // Expandable Treehouse Bed
  '2067200072050466817': 'Bedroom & Comfort', // Cloud Modular Sofa Boneless L-Shaped Corduroy Sofa
  '1990484235365167106': 'Bedroom & Comfort', // relaxation chair massage chair
  '1990484273630208001': 'Bedroom & Comfort', // relaxation chair massage chair
  '1990484067362185217': 'Bedroom & Comfort', // relaxation chair massage chair
  '1990484307067199489': 'Bedroom & Comfort', // relaxation chair massage chair
  '1990484603558354945': 'Bedroom & Comfort', // relaxation chair massage chair
  '1990484090682650625': 'Bedroom & Comfort', // relaxation chair massage chair
  '1990484106402902018': 'Bedroom & Comfort', // relaxation chair massage chair
  '1410047931251298304': 'Bedroom & Comfort', // Outdoor Folding Moon/Rocking Chair

  // Home Décor (4 products)
  '1463036925509242880': 'Home Décor', // Crystal Ball Salt Stone Moisturizing And Humidifying (active)
  '2027676495699533825': 'Home Décor', // C-Shaped Chating Table, Center Table, Coffee Table
  '2016750094074900482': 'Home Décor', // Console Table, Sofa Table
  'A91C93F8-6B3F-4B1A-A056-18CF9BDA62D8': 'Home Décor', // Spandex Chair Covers Printed Stretch Elastic

  // Lighting (13 products)
  '1C01D7EB-9638-4A3C-93CB-C912AE53385C': 'Lighting', // Small Crystal Lamp
  '1385770199189426176': 'Lighting', // Multifunctional Folding Book Light
  '1385108704310988800': 'Lighting', // World Tank 3D Light
  '1380386691981905920': 'Lighting', // Net Red Girl Heart Bedside Night Light
  '1394474096397520896': 'Lighting', // Special Bedside Night Light
  '1389130632445169664': 'Lighting', // Warm White Light Cabinet Door Hinge Lamp
  '2509020927341603200': 'Lighting', // High-grade Empty Chandelier
  '1392011497030422528': 'Lighting', // Tesla Model3 Ambient Light (active)
  '09CFC7FD-1308-403B-885F-3E0D6C60148A': 'Lighting', // Color LED Mushroom Light
  '1370269100848320512': 'Lighting', // Couples Bedside Lamp
  '343D6A4C-78A0-493E-956E-BAFC57963CAE': 'Lighting', // LED flame light
  '1390540474586107904': 'Lighting', // Bamboo Woven Chandelier
  '6AC44803-E8A3-456D-B355-882BDB1EC2A2': 'Lighting', // Nordic Retro Minimalist Glass Dining Room Chandelier

  // Everyday Solutions (6 products)
  '1409666578445897728': 'Everyday Solutions', // Laundry Bubble Paper Laundry Tablets
  '1650413638777315328': 'Everyday Solutions', // Cone Grinder Electric Coffee Grinder
  '1397847506796285952': 'Everyday Solutions', // Bicycle Light Flashlight
  '1392305439689019392': 'Everyday Solutions', // Hair Comb Magic Hair Comb
  'B49B60FF-C14E-49AB-B899-DA6B6237DAA4': 'Everyday Solutions', // High pressure road washer
  '2100144164459298818': 'Everyday Solutions', // 3000AMP Booster Jumper Starter Cables
};

async function runMigration() {
  console.log('Starting category migration in Supabase...\n');

  // 1. Fetch all products to verify no orphaned items
  const { data: products, error: pErr } = await supabase.from('products').select('id, name, category');
  if (pErr) throw pErr;

  console.log(`Found ${products.length} products in 'products' table.`);
  for (const p of products) {
    if (!productCategoryMapping[p.id]) {
      console.warn(`WARNING: Product ${p.id} (${p.name}) not in mapping!`);
    }
  }

  // 2. Fetch all cj_products
  const { data: cjProducts, error: cjErr } = await supabase.from('cj_products').select('cj_product_id, name, category, editor_content');
  if (cjErr) throw cjErr;

  console.log(`Found ${cjProducts.length} products in 'cj_products' table.\n`);
  for (const cj of cjProducts) {
    if (!productCategoryMapping[cj.cj_product_id]) {
      console.warn(`WARNING: CJ Product ${cj.cj_product_id} (${cj.name}) not in mapping!`);
    }
  }

  // 3. Update 'products' table
  console.log('Updating products table...');
  let updatedProductsCount = 0;
  for (const p of products) {
    const newCategory = productCategoryMapping[p.id];
    if (!newCategory) continue;

    const { error: updateErr } = await supabase
      .from('products')
      .update({
        category: newCategory,
        updated_at: new Date().toISOString()
      })
      .eq('id', p.id);

    if (updateErr) {
      console.error(`Failed to update product ${p.id}:`, updateErr);
    } else {
      updatedProductsCount++;
    }
  }
  console.log(`Successfully updated ${updatedProductsCount} rows in 'products'.\n`);

  // 4. Update 'cj_products' table (both category column and editor_content JSON)
  console.log('Updating cj_products table...');
  let updatedCjCount = 0;
  for (const cj of cjProducts) {
    const newCategory = productCategoryMapping[cj.cj_product_id];
    if (!newCategory) continue;

    const updatedEditorContent = {
      ...(cj.editor_content || {}),
      category: newCategory
    };

    const { error: updateErr } = await supabase
      .from('cj_products')
      .update({
        category: newCategory,
        editor_content: updatedEditorContent,
        updated_at: new Date().toISOString()
      })
      .eq('cj_product_id', cj.cj_product_id);

    if (updateErr) {
      console.error(`Failed to update cj_product ${cj.cj_product_id}:`, updateErr);
    } else {
      updatedCjCount++;
    }
  }
  console.log(`Successfully updated ${updatedCjCount} rows in 'cj_products'.\n`);

  // 5. Verification queries
  console.log('--- Verification: category counts in products ---');
  const { data: vProducts } = await supabase.from('products').select('id, category');
  const prodSummary = {};
  vProducts.forEach(p => prodSummary[p.category] = (prodSummary[p.category] || 0) + 1);
  console.log(prodSummary);

  console.log('--- Verification: category counts in cj_products ---');
  const { data: vCj } = await supabase.from('cj_products').select('cj_product_id, category');
  const cjSummary = {};
  vCj.forEach(p => cjSummary[p.category] = (cjSummary[p.category] || 0) + 1);
  console.log(cjSummary);

  const oldCategories = ['Living', 'Objects'];
  const orphanedProd = vProducts.filter(p => oldCategories.includes(p.category));
  const orphanedCj = vCj.filter(p => oldCategories.includes(p.category));

  if (orphanedProd.length === 0 && orphanedCj.length === 0) {
    console.log('\nMigration SUCCESSFUL! Zero orphaned products or legacy category names remain.');
  } else {
    console.error(`\nWARNING: Found ${orphanedProd.length} products and ${orphanedCj.length} cj_products with old categories!`);
  }
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
