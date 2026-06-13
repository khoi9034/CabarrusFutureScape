CREATE TABLE IF NOT EXISTS public.new_construction_permits_raw (
  source_row_number integer PRIMARY KEY,
  b1_alt_id text,
  b1_app_type_alias text,
  b1_file_dd text,
  address text,
  parcelnum text,
  co_issued text,
  co_date text,
  source_file text NOT NULL DEFAULT 'BuildingPermits_NewConstruction.csv',
  source_confidence text NOT NULL DEFAULT 'staff_provided_extract',
  ingested_at timestamptz NOT NULL DEFAULT now()
);

DROP TABLE IF EXISTS public.parcel_development_prediction_labels;
DROP TABLE IF EXISTS public.parcel_new_construction_summary;
DROP TABLE IF EXISTS public.new_construction_permit_parcel_relationship;
DROP TABLE IF EXISTS public.new_construction_permits_clean;

CREATE TABLE public.new_construction_permits_clean AS
WITH normalized AS (
  SELECT
    source_row_number,
    NULLIF(trim(b1_alt_id), '') AS source_permit_id,
    NULLIF(trim(b1_app_type_alias), '') AS permit_type_raw,
    CASE
      WHEN b1_file_dd ~ '^\d{4}-\d{2}-\d{2}' THEN left(b1_file_dd, 10)::date
      ELSE NULL
    END AS permit_file_date,
    NULLIF(trim(address), '') AS address_raw,
    NULLIF(trim(parcelnum), '') AS parcel_num_raw,
    NULLIF(regexp_replace(coalesce(parcelnum, ''), '[^0-9]', '', 'g'), '') AS parcel_num_normalized,
    CASE
      WHEN lower(trim(coalesce(co_issued, ''))) IN ('1', 'true', 't', 'yes', 'y') THEN true
      WHEN lower(trim(coalesce(co_issued, ''))) IN ('0', 'false', 'f', 'no', 'n') THEN false
      ELSE NULL
    END AS co_issued_bool,
    CASE
      WHEN co_date ~ '^\d{4}-\d{2}-\d{2}' THEN left(co_date, 10)::date
      ELSE NULL
    END AS co_date_parsed,
    source_file,
    source_confidence
  FROM public.new_construction_permits_raw
)
SELECT
  md5(
    coalesce(source_file, '') || ':' ||
    source_row_number::text || ':' ||
    coalesce(source_permit_id, '')
  ) AS new_construction_permit_id,
  source_permit_id,
  permit_type_raw,
  CASE
    WHEN permit_type_raw = 'Building Residential New' THEN 'residential_new_construction'
    WHEN permit_type_raw = 'Building Commercial New' THEN 'commercial_new_construction'
    ELSE 'review_required'
  END AS permit_type_class,
  permit_file_date,
  EXTRACT(YEAR FROM permit_file_date)::integer AS permit_year,
  EXTRACT(MONTH FROM permit_file_date)::integer AS permit_month,
  address_raw,
  parcel_num_raw,
  parcel_num_normalized,
  co_issued_bool AS co_issued,
  co_date_parsed AS co_date,
  EXTRACT(YEAR FROM co_date_parsed)::integer AS co_year,
  CASE
    WHEN co_issued_bool = false AND co_date_parsed IS NOT NULL THEN 'review_required'
    WHEN co_date_parsed IS NOT NULL AND permit_file_date IS NOT NULL AND co_date_parsed < permit_file_date THEN 'review_required'
    WHEN co_issued_bool = true OR co_date_parsed IS NOT NULL THEN 'completed'
    WHEN co_issued_bool = false AND co_date_parsed IS NULL THEN 'permitted_not_completed'
    ELSE 'review_required'
  END AS construction_status,
  CASE
    WHEN permit_file_date IS NOT NULL
      AND co_date_parsed IS NOT NULL
      AND co_date_parsed >= permit_file_date
      THEN (co_date_parsed - permit_file_date)::integer
    ELSE NULL
  END AS days_to_co,
  CASE
    WHEN permit_type_raw IN ('Building Residential New', 'Building Commercial New') THEN true
    ELSE false
  END AS major_development_flag,
  source_file,
  source_confidence,
  now()::timestamptz AS cleaned_at
FROM normalized;

ALTER TABLE public.new_construction_permits_clean
  ADD PRIMARY KEY (new_construction_permit_id);

CREATE INDEX idx_new_construction_clean_source_permit_id
  ON public.new_construction_permits_clean (source_permit_id);
CREATE INDEX idx_new_construction_clean_permit_date
  ON public.new_construction_permits_clean (permit_file_date);
CREATE INDEX idx_new_construction_clean_permit_year
  ON public.new_construction_permits_clean (permit_year);
CREATE INDEX idx_new_construction_clean_type_class
  ON public.new_construction_permits_clean (permit_type_class);
CREATE INDEX idx_new_construction_clean_parcel_num_normalized
  ON public.new_construction_permits_clean (parcel_num_normalized);

CREATE TABLE public.new_construction_permit_parcel_relationship AS
WITH parcel_keys AS (
  SELECT
    regexp_replace(coalesce(pin14, ''), '[^0-9]', '', 'g') AS pin14_normalized,
    COUNT(*) AS parcel_match_count,
    MIN(official_parcel_id) AS official_parcel_id,
    MIN(pin14) AS pin14
  FROM public.parcels_enriched
  WHERE pin14 IS NOT NULL
    AND NULLIF(regexp_replace(coalesce(pin14, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
  GROUP BY regexp_replace(coalesce(pin14, ''), '[^0-9]', '', 'g')
),
classified AS (
  SELECT
    c.*,
    CASE
      WHEN c.parcel_num_raw IS NULL OR trim(c.parcel_num_raw) = '' THEN true
      WHEN c.parcel_num_normalized IS NULL THEN true
      WHEN length(c.parcel_num_normalized) <> 14 THEN true
      WHEN c.parcel_num_normalized ~ '^([0-9])\1+$' THEN true
      ELSE false
    END AS invalid_placeholder_parcel
  FROM public.new_construction_permits_clean c
),
matched AS (
  SELECT
    c.*,
    pk.parcel_match_count,
    pk.official_parcel_id AS matched_official_parcel_id,
    pk.pin14 AS matched_pin14
  FROM classified c
  LEFT JOIN parcel_keys pk
    ON c.parcel_num_normalized = pk.pin14_normalized
)
SELECT
  md5(new_construction_permit_id || ':parcel-match') AS relationship_id,
  new_construction_permit_id,
  source_permit_id,
  CASE WHEN parcel_match_count = 1 AND NOT invalid_placeholder_parcel THEN matched_official_parcel_id ELSE NULL END
    AS official_parcel_id,
  CASE WHEN parcel_match_count = 1 AND NOT invalid_placeholder_parcel THEN matched_pin14 ELSE NULL END AS pin14,
  parcel_num_raw,
  parcel_num_normalized,
  CASE
    WHEN invalid_placeholder_parcel THEN 'invalid_placeholder'
    WHEN coalesce(parcel_match_count, 0) = 0 THEN 'unmatched'
    WHEN parcel_match_count > 1 THEN 'ambiguous'
    WHEN parcel_num_raw = matched_pin14 THEN 'exact'
    ELSE 'normalized_exact'
  END AS match_method,
  CASE
    WHEN invalid_placeholder_parcel THEN 'invalid_placeholder'
    WHEN coalesce(parcel_match_count, 0) = 0 THEN 'unmatched'
    WHEN parcel_match_count > 1 THEN 'ambiguous'
    WHEN parcel_num_raw = matched_pin14 THEN 'exact'
    ELSE 'normalized_exact'
  END AS match_confidence,
  CASE
    WHEN invalid_placeholder_parcel AND parcel_num_raw IS NULL THEN 'missing parcel number'
    WHEN invalid_placeholder_parcel THEN 'invalid or placeholder parcel number'
    WHEN coalesce(parcel_match_count, 0) = 0 THEN 'no matching parcels_enriched.pin14'
    WHEN parcel_match_count > 1 THEN 'ambiguous pin14 matched multiple parcels'
    ELSE NULL
  END AS match_warning,
  now()::timestamptz AS matched_at
FROM matched;

ALTER TABLE public.new_construction_permit_parcel_relationship
  ADD PRIMARY KEY (relationship_id);

CREATE INDEX idx_new_construction_relationship_permit
  ON public.new_construction_permit_parcel_relationship (new_construction_permit_id);
CREATE INDEX idx_new_construction_relationship_parcel
  ON public.new_construction_permit_parcel_relationship (official_parcel_id);
CREATE INDEX idx_new_construction_relationship_confidence
  ON public.new_construction_permit_parcel_relationship (match_confidence);

CREATE TABLE public.parcel_new_construction_summary AS
WITH activity AS (
  SELECT
    r.official_parcel_id,
    r.pin14,
    c.*
  FROM public.new_construction_permit_parcel_relationship r
  JOIN public.new_construction_permits_clean c
    ON c.new_construction_permit_id = r.new_construction_permit_id
  WHERE r.official_parcel_id IS NOT NULL
),
anchor AS (
  SELECT max(permit_file_date) AS max_permit_date
  FROM public.new_construction_permits_clean
)
SELECT
  a.official_parcel_id,
  MIN(a.pin14) AS pin14,
  COUNT(*)::integer AS total_new_construction_permits,
  COUNT(*) FILTER (WHERE permit_type_class = 'residential_new_construction')::integer
    AS residential_new_construction_permits,
  COUNT(*) FILTER (WHERE permit_type_class = 'commercial_new_construction')::integer
    AS commercial_new_construction_permits,
  MIN(permit_file_date) AS first_new_construction_permit_date,
  MAX(permit_file_date) AS latest_new_construction_permit_date,
  MAX(co_date) AS latest_co_date,
  COUNT(*) FILTER (WHERE construction_status = 'completed')::integer
    AS completed_new_construction_count,
  COUNT(*) FILTER (WHERE construction_status = 'permitted_not_completed')::integer
    AS active_uncompleted_new_construction_count,
  AVG(days_to_co) FILTER (WHERE days_to_co IS NOT NULL)::numeric(12,2)
    AS average_days_to_co,
  COUNT(DISTINCT permit_year) FILTER (WHERE permit_year IS NOT NULL)::integer
    AS new_construction_years_active,
  COUNT(*) FILTER (
    WHERE permit_file_date > (SELECT max_permit_date FROM anchor) - interval '1 year'
  )::integer AS recent_1yr_new_construction_count,
  COUNT(*) FILTER (
    WHERE permit_file_date > (SELECT max_permit_date FROM anchor) - interval '3 years'
  )::integer AS recent_3yr_new_construction_count,
  COUNT(*) FILTER (
    WHERE permit_file_date > (SELECT max_permit_date FROM anchor) - interval '5 years'
  )::integer AS recent_5yr_new_construction_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE construction_status = 'review_required') > 0 THEN 'review_required'
    WHEN COUNT(*) >= 3 THEN 'repeated_activity'
    WHEN COUNT(*) FILTER (WHERE construction_status = 'permitted_not_completed') > 0 THEN 'active_permitted'
    WHEN COUNT(*) FILTER (
      WHERE construction_status = 'completed'
        AND co_date > (SELECT max_permit_date FROM anchor) - interval '3 years'
    ) > 0 THEN 'completed_recent'
    WHEN COUNT(*) FILTER (WHERE construction_status = 'completed') > 0 THEN 'historical_completed'
    ELSE 'no_recent_activity'
  END AS development_stage,
  now()::timestamptz AS summarized_at
FROM activity a
GROUP BY a.official_parcel_id;

ALTER TABLE public.parcel_new_construction_summary
  ADD PRIMARY KEY (official_parcel_id);

CREATE INDEX idx_parcel_new_construction_summary_pin14
  ON public.parcel_new_construction_summary (pin14);
CREATE INDEX idx_parcel_new_construction_summary_latest
  ON public.parcel_new_construction_summary (latest_new_construction_permit_date);
CREATE INDEX idx_parcel_new_construction_summary_stage
  ON public.parcel_new_construction_summary (development_stage);

CREATE TABLE public.parcel_development_prediction_labels AS
WITH year_bounds AS (
  SELECT
    (MIN(permit_year) - 1)::integer AS min_snapshot_year,
    MAX(permit_year)::integer AS max_snapshot_year
  FROM public.new_construction_permits_clean
  WHERE permit_year IS NOT NULL
),
snapshot_years AS (
  SELECT generate_series(min_snapshot_year, max_snapshot_year)::integer AS snapshot_year
  FROM year_bounds
  WHERE min_snapshot_year IS NOT NULL
    AND max_snapshot_year IS NOT NULL
),
parcel_base AS (
  SELECT official_parcel_id, pin14
  FROM public.parcels_enriched
  WHERE official_parcel_id IS NOT NULL
),
matched_activity AS (
  SELECT
    r.official_parcel_id,
    c.permit_file_date,
    c.permit_type_class,
    c.construction_status
  FROM public.new_construction_permit_parcel_relationship r
  JOIN public.new_construction_permits_clean c
    ON c.new_construction_permit_id = r.new_construction_permit_id
  WHERE r.official_parcel_id IS NOT NULL
    AND c.permit_file_date IS NOT NULL
),
label_base AS (
  SELECT
    p.official_parcel_id,
    p.pin14,
    y.snapshot_year,
    make_date(y.snapshot_year + 1, 1, 1) AS future_start,
    make_date(y.snapshot_year + 1, 12, 31) AS future_1yr_end,
    make_date(y.snapshot_year + 3, 12, 31) AS future_3yr_end
  FROM parcel_base p
  CROSS JOIN snapshot_years y
)
SELECT
  b.official_parcel_id,
  b.pin14,
  b.snapshot_year,
  (COUNT(a.*) FILTER (
    WHERE a.permit_file_date >= b.future_start
      AND a.permit_file_date <= b.future_1yr_end
  ) > 0) AS new_construction_next_1yr,
  (COUNT(a.*) FILTER (
    WHERE a.permit_file_date >= b.future_start
      AND a.permit_file_date <= b.future_3yr_end
  ) > 0) AS new_construction_next_3yr,
  (COUNT(a.*) FILTER (
    WHERE a.permit_file_date >= b.future_start
      AND a.permit_file_date <= b.future_3yr_end
      AND a.permit_type_class = 'residential_new_construction'
  ) > 0) AS residential_new_construction_next_3yr,
  (COUNT(a.*) FILTER (
    WHERE a.permit_file_date >= b.future_start
      AND a.permit_file_date <= b.future_3yr_end
      AND a.permit_type_class = 'commercial_new_construction'
  ) > 0) AS commercial_new_construction_next_3yr,
  (COUNT(a.*) FILTER (
    WHERE a.permit_file_date >= b.future_start
      AND a.permit_file_date <= b.future_3yr_end
      AND a.construction_status = 'completed'
  ) > 0) AS co_issued_next_3yr,
  MIN(a.permit_file_date) FILTER (
    WHERE a.permit_file_date >= b.future_start
      AND a.permit_file_date <= b.future_3yr_end
  ) AS first_future_new_construction_date,
  COUNT(a.*) FILTER (
    WHERE a.permit_file_date >= b.future_start
      AND a.permit_file_date <= b.future_3yr_end
  )::integer AS future_permit_count_3yr,
  'staff_provided_new_construction_extract'::text AS label_source,
  now()::timestamptz AS label_created_at
FROM label_base b
LEFT JOIN matched_activity a
  ON a.official_parcel_id = b.official_parcel_id
 AND a.permit_file_date >= b.future_start
 AND a.permit_file_date <= b.future_3yr_end
GROUP BY b.official_parcel_id, b.pin14, b.snapshot_year, b.future_start, b.future_1yr_end, b.future_3yr_end;

ALTER TABLE public.parcel_development_prediction_labels
  ADD PRIMARY KEY (official_parcel_id, snapshot_year);

CREATE INDEX idx_parcel_development_prediction_labels_year
  ON public.parcel_development_prediction_labels (snapshot_year);
CREATE INDEX idx_parcel_development_prediction_labels_next3
  ON public.parcel_development_prediction_labels (new_construction_next_3yr);
