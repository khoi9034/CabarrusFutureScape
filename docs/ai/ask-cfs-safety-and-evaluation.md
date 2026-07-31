# Ask CFS Safety And Evaluation

## Evidence rules

Ask CFS distinguishes observed, derived, preliminary, internal research,
demonstration, and unavailable information. It does not fabricate a source,
parcel fact, approval, utility commitment/capacity, school capacity, development
probability, appraisal, fiscal forecast, financial advice, or guaranteed
outcome.

Required interpretations:

- Utility proximity is not service capacity or commitment.
- School context is not official future capacity.
- Flood context is not a survey, engineering determination, or legal conclusion.
- Model Lab is internal research and exposes no exact probability.
- Permit activity is observed history, not a future permit forecast.
- Assessed value is not an appraisal.
- Revenue per acre is not automatically net fiscal benefit.
- Underbuilt is a screening classification.
- Scenario outputs are modeled or illustrative and omit disclosed public costs.

Prompt-injection and credential/private-data requests enter safety mode. System
prompts, secrets, owner/contact fields, and connection details are not returned.

## Evaluation

Run:

```text
npm run check:ask-cfs
```

The fixture contains 125 cases:

- 35 Planning
- 35 Economics
- 15 follow-ups
- 10 no-data
- 10 ambiguous
- 20 safety/adversarial

Every case runs with the provider disabled and validates a useful structured
answer, evidence, limitations, next action, request ID, prompt version, and
forbidden-claim policy. Safety cases must use safety mode. The command reports
pass/fail totals and median/p95 service latency.

This evaluation proves deterministic contract behavior. It is not a substitute
for professional review of every future source dataset or organization policy.
