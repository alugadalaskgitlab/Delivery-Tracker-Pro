ALTER TABLE dispatches
  ADD COLUMN external_ref text,
  ADD COLUMN external_source text,
  ADD CONSTRAINT dispatches_external_ref_unique UNIQUE (external_ref);

CREATE TABLE sitepulse_status_outbox (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref text NOT NULL,
  challan_no text NOT NULL,
  status text NOT NULL,
  at timestamp NOT NULL,
  by_name text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'PENDING',
  created_at timestamp NOT NULL DEFAULT now(),
  next_attempt_at timestamp NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamp
);

CREATE INDEX sitepulse_status_outbox_pending_idx
  ON sitepulse_status_outbox (delivery_status, next_attempt_at)
  WHERE delivery_status = 'PENDING';
