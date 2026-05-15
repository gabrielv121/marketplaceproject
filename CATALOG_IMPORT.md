# Catalog Import

Use the CSV importer when you want to add many shoes, apparel items, brands, and accessories to `catalog_products` without writing SQL.

## 1. Add the service role key locally

In Supabase, go to Project Settings -> API and copy the `service_role` key.

Add it to `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Do not put the real service role key in frontend code or commit it.

## 2. Edit the CSV

Open `data/catalog-products.csv` and add rows. Each row is one catalog product.

Important columns:

- `handle`: unique slug. Leave blank and the importer generates one from brand + title.
- `title`, `price_min`, `price_max`: required.
- `tags`, `home_rails`, `activities`, `image_gallery`: lists separated with `|`.
- `department_slug`: usually `men`, `women`, `kids`, or `unisex`.
- `gender`: `men`, `women`, `kids`, or `unisex`.
- `published`: `true` or `false`.

Example list value:

```csv
dept-men|sneakers|nike|home-trending-sneakers
```

## 3. Test the file

```bash
npm run catalog:dry-run
```

This validates the CSV and prints what would import.

## 4. Import to Supabase

```bash
npm run catalog:import
```

To import a different CSV file:

```bash
npm run catalog:import -- data/my-products.csv
```

The importer upserts by `handle`, so running it again updates existing catalog products with the same handle.

## KicksDB image/product import

Use this when you want exact sneaker product images and metadata from KicksDB/Kicks Dev instead of manually filling the CSV.

Get an API key from <https://kicks.dev/api-keys>, then add it to `.env.local`:

```env
KICKSDB_API_KEY=your-kicksdb-api-key
```

Preview the default KicksDB import:

```bash
npm run kicks:dry-run
```

Import the default KicksDB catalog:

```bash
npm run kicks:import
```

The default import searches Air Jordan 1-14 plus popular New Balance, ASICS, Nike, Adidas, Converse, Vans, Puma, Reebok, Hoka, On, Saucony, Salomon, Crocs, UGG, Birkenstock, Timberland, and streetwear/apparel queries.

After a successful import, old non-KicksDB placeholder catalog rows are unpublished so the app focuses on API-backed catalog data. To keep existing manually-created rows published, pass `--keep-existing`:

```bash
npm run kicks:import -- --keep-existing
```

Import a custom query:

```bash
npm run kicks:import -- --query "Air Jordan 4 Retro" --limit-per-query 20
```

Import selected Jordan models:

```bash
npm run kicks:import -- --models 1,3,4,5,9,11
```

The KicksDB importer upserts by the KicksDB/StockX product slug and maps exact `image`/`gallery` URLs into `featured_image_url` and `image_gallery`.
