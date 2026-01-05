WITH decoded AS (
  SELECT
    listing_pk,
    json_extract(json(result_json), '$.body.output[0].content[0].text') AS txt
  FROM chatgpt_batch_items
),
joined AS (
  SELECT
    listing_pk,
    printf(
      '%s-%s-%s-%s-%s',
      json_extract(txt, '$.model_name'),
      json_extract(txt, '$.manu_model_code'),
      json_extract(txt, '$.engine_cc'),
      json_extract(txt, '$.turbo'),
      json_extract(txt, '$.body_type')
    ) AS raw_slug
  FROM decoded
)
  select listing_pk, model_pk from (
SELECT
  listing_pk,
  -- basic slugify: lowercase, trim, collapse spaces to dash, remove double dashes
  lower(
    replace(
      replace(
        replace(trim(raw_slug), ' ', '-'),  -- spaces to dashes
        '--', '-'                           -- collapse double dashes (repeat if needed)
      ),
      '--', '-'
    )
  ) AS slugish
FROM joined
WHERE listing_pk IN (

select listing_pk from car_listings c where model_pk is null and model_sts=0
  and listing_pk in (select listing_pk from chatgpt_batch_items)
and listing_pk in (select listing_pk from car_listing_options)
and listing_pk in (select listing_pk from car_listing_remarks)
  )
  ) r inner join models m on r.slugish = m.model_slug
