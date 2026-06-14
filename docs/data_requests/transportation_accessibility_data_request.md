# Transportation and Accessibility Data Request

Phase 12A found current transportation source candidates, but future
development prediction features will be stronger if CFS receives internal or
organizational transportation planning data with dates, status, and geometry.

## Requested Datasets

Please provide GIS layers, tables, or spreadsheets for:

- adopted transportation plan project list;
- roadway widening projects;
- planned road extensions;
- intersection improvement projects;
- interchange or major corridor projects;
- funded and unfunded transportation projects;
- road access or driveway restriction areas if available;
- planned transit, rail, or multimodal corridor projects if relevant.

## Preferred Fields

Each project record should include:

- project name;
- project type;
- road name;
- jurisdiction or maintaining agency;
- project status;
- funding status;
- expected year or construction year;
- adoption year or plan year;
- geometry, preferably line or polygon;
- source plan name;
- source URL or document reference;
- notes.

## Why Dates Matter

Current road layers can describe today's accessibility, but prediction training
needs time-aware features. If a project was adopted or built after a model
snapshot year, it cannot be used as information available to the model at that
snapshot. Project dates make it possible to build leakage-safe features such as
`near_planned_transportation_project_prior_3yr` or
`planned_corridor_within_1_mile_known_by_snapshot_year`.

## CFS Use

The requested data would support future features including:

- distance to nearest existing road;
- distance to major road or highway corridor;
- distance to planned road project;
- road density near a parcel;
- intersection density near a parcel;
- corridor access score;
- rail corridor proximity;
- planned transportation project flags.

These features are not active yet and should not be interpreted as prediction
outputs until CFS completes source QA, temporal-safety review, and model
validation.
