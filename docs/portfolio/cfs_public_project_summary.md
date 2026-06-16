# CFS Public Project Summary

## Short Version

Cabarrus FutureScape is an internal planning intelligence prototype that brings
parcel search, zoning, permits, flood constraints, school assignment,
transportation context, utility proxy context, and model-governance information
into one parcel-based due diligence workspace.

## Medium Version

Cabarrus FutureScape explores how a county planning team could review parcel
context more quickly and transparently. The prototype combines a Next.js
frontend, FastAPI backend, PostGIS spatial database, ArcGIS SceneView map, and
Python data pipelines to support parcel search, selected parcel map focus, Due
Diligence review, Executive Print reporting, and Methodology transparency.

The project includes internal development model research, but it does not expose
parcel-level probabilities or ranking classes. Model outputs remain aggregate
and governance-focused because calibration, official data gaps, and production
review still need work.

## Technical Version

CFS is a local full-stack GIS and planning intelligence prototype. It integrates
parcel records, zoning context, permit activity, FEMA flood constraints, school
attendance-zone assignment, presentation-derived school utilization caveats,
transportation accessibility, STIP/AADT context, utility proxy context, and
internal model QA artifacts.

The frontend is built with Next.js, React, and TypeScript. FastAPI serves local
REST endpoints backed by PostGIS spatial tables and Python ingestion/transform
pipelines. ArcGIS Maps SDK SceneView provides 3D parcel focus and operational
overlay rendering.

Model research is intentionally internal-only:

- no parcel-level prediction probabilities;
- no parcel-level ranking classes;
- no public prediction endpoint;
- no production-ready claims.

## GitHub README-Style Blurb

Cabarrus FutureScape is a parcel-centered planning intelligence prototype for
local due diligence and constraint review. It demonstrates a full-stack
GIS/planning workflow using Next.js, FastAPI, PostGIS, ArcGIS Maps SDK, and
Python pipelines. Users can search a parcel, focus the map, review parcel
context, inspect constraints, generate an Executive Print report, and read
Methodology documentation explaining data sources, limitations, and model
governance. Development model research is aggregate-only and not public-facing.

## LinkedIn Post Draft

I have been building Cabarrus FutureScape, a full-stack planning intelligence
prototype focused on parcel-level due diligence.

The idea is simple: planning staff should be able to search a parcel and quickly
see the evidence that matters, including zoning, permit activity, FEMA flood
constraints, school assignment, transportation context, utility proxy context,
and clear data caveats.

Technically, the project combines Next.js/TypeScript, FastAPI, PostGIS, ArcGIS
Maps SDK, and Python data pipelines. It also includes internal model research
and governance documentation, but does not expose parcel-level prediction
probabilities or claim production readiness.

The most valuable part has been learning how much good planning technology
depends on responsible communication: what is verified, what is provisional,
what is only proxy context, and what should not be used for decisions yet.
