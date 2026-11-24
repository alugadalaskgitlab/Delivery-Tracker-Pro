ALTER TABLE parties
  ADD COLUMN sitepulse_party_id text;

CREATE UNIQUE INDEX parties_sitepulse_party_id_unique
  ON parties (sitepulse_party_id);

ALTER TABLE sites
  ADD COLUMN sitepulse_site_id text;

CREATE UNIQUE INDEX sites_party_sitepulse_site_unique
  ON sites (party_id, sitepulse_site_id);

CREATE TABLE sitepulse_orders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  sitepulse_order_id text NOT NULL UNIQUE,
  site_id varchar NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  period_from timestamp NOT NULL,
  period_to timestamp NOT NULL,
  status text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE sitepulse_order_lines (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id varchar NOT NULL REFERENCES sitepulse_orders(id) ON DELETE CASCADE,
  mix text NOT NULL,
  ordered_mt numeric(10, 2) NOT NULL
);

CREATE INDEX sitepulse_orders_site_id_idx ON sitepulse_orders (site_id);
CREATE INDEX sitepulse_order_lines_order_id_idx ON sitepulse_order_lines (order_id);
