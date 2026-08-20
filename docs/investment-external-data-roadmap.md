# CFS Investment External Data Roadmap

> **Retired historical reference:** The Investments product and CASE-1 workflow are retired and are not part of the active Demo, Local, Enterprise, acceptance, or deployment surface. This document is retained only as historical design or evidence and must not be used as an operating runbook.

Phase IP-2C: External Property, Market, and Location Data Research

This roadmap is for internal CFS Investment only. CFS remains a screening-level land and property research tool. External data can improve due-diligence triage, but it must not be described as investment advice, an appraisal, a guaranteed return, a confirmed market value, a confirmed development outcome, or confirmed utility service/capacity.

## 1. Current Internal Data Coverage

The local CFS database already has strong public/proxy coverage. The important gaps are sale qualification, active listing/licensed market data, verified utility capacity, and authoritative development-pipeline status.

| Domain | Current CFS coverage | Local tables / services observed | Status | CFS Investment use |
|---|---|---|---|---|
| Parcels and acreage | 110,017 parcel rows with calculated acreage and parcel quality fields | `parcels_enriched`, `parcels_clean`, `/parcels` | Authoritative/proxy mix; local-only | Parcel identity, acreage band, screening scope |
| Assessed land/improvement context | Land, building/improvement, assessed/total value fields | `parcels_enriched`, `parcel_tax_value_enrichment_features`, `tax_parcel_value_enrichment` | Authoritative assessor context; not appraisal | Basis context only; never market value claim |
| Sales/transfers | `saleprice`, `saleyear`, `salemonth`, deed book/page; no deed type or official qualified-sale flag | `parcels_enriched`, IP-2B basis services | Incomplete; needs deed/qualification enrichment | Sale quality band, recency band, comparable depth |
| Permits | Permit relationships, new-construction permits, segments and time summaries | `real_property_permit_parcel_relationship`, `new_construction_permits_clean`, `permit_intelligence_segments` | Good local context; status semantics need validation | Growth pressure, development activity |
| Planning cases | Accela plan-review feature summary | `parcel_accela_plan_review_features` | Useful current-context proxy | Pipeline signal, due diligence flag |
| Zoning | County and municipal zoning overlays plus historical zoning | `parcel_zoning_overlay_v2`, `historical_zoning_clean`, jurisdiction zoning tables | Strong but needs official update cadence | Zoning support, entitlement/repositioning signal |
| Future land use | Partial through planning/area plan and zoning-derived features | `parcel_central_area_plan_features`, area-plan logic | Incomplete | Planning alignment, long-term optionality |
| Flood | FEMA NFHL cleaned layers and parcel overlay | `fema_nfhl_flood_zones_clean`, `parcel_flood_constraint_overlay` | Strong public hazard context | Constraint band; professional verification required |
| Schools | Attendance zones and parcel school summary; current `school_capacity` table has zero direct rows | `school_zones`, `parcel_school_summary`, school utilization seed tables | Partial/proxy | Service pressure caveat |
| Transportation and traffic | Roads, AADT stations, STIP projects, parcel accessibility/traffic features | `transportation_aadt_stations_clean`, `transportation_stip_projects_clean`, parcel transport feature tables | Good public proxy | Access, traffic context, project proximity |
| WSACC sewer proximity | Sewer pipes, manholes, subbasins and parcel overlay features | `wsacc_*`, `parcel_wsacc_utility_features` | Sewer proximity/basin proxy only | Utility-readiness proxy; capacity data needed |
| Development model and screening output | Model-ready features and screening bands | `parcel_development_model_features`, `parcel_development_screening_output` | Internal screening only | Readiness band, land opportunity class |
| Economics / Power BI | Parcel economic signal facts, segment-aware exports | `/economics/intelligence`, `/economics/powerbi-export` | Good demo/local parity | Economic opportunity, export/report context |
| Municipal boundaries | Planning and jurisdiction overlays | `planning_boundaries_clean`, `parcel_jurisdiction_overlay` | Good | Market/geography grouping |
| Building footprints | Not observed as a standalone authoritative footprint source | N/A | Gap | Existing-use/improvement validation |
| Addresses | Present in some source tables; avoid owner/mailing fields | parcel/permit source tables | Sensitive use; display sparingly | Location matching only |
| Development activity | Permit and plan-review signals | development activity summaries | Good proxy, not completion proof | Pipeline context |

Privacy note: some raw/local tables contain owner, mailing, account, or address-like fields. These should stay out of CFS Investment responses, public demo exports, and Power BI outputs unless a future approved display policy explicitly allows a safe field.

## 2. External Source Evaluation Matrix

| Source | Category | Provider | Coverage | Access | Cost/auth | Production suitability | Prototype suitability | Recommended status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Cabarrus County Register of Deeds online records | Deeds/transfers | Cabarrus County | County | Web records; public office workflow | Public/manual; no app key identified | Medium after access/legal workflow | Medium | Request Access / Manual Workflow | County says land-related documents are recorded, indexed, preserved, and public record. Use for deed type and transaction verification, not owner display. https://www.cabarruscounty.us/Government/Departments/Register-of-Deeds |
| Cabarrus Land Records / Claris / Tax real estate search | Parcels/sales/value | Cabarrus County Tax Administration | County | Web/property systems | Public/manual; verify terms | Medium | High for QA | Use Now / Request Access | Official tax site says data comes from recorded deeds, plats, and public records and should be verified against public sources. https://tax.cabarruscounty.us/RealEstate.aspx |
| Cabarrus GIS Open Data | Parcels/planning/zoning | Cabarrus County GIS | County | ArcGIS Hub downloads/services | Public | High for public layers | High | Use Now | County open data has property/land records and planning/development categories. https://gis-cabarrus.opendata.arcgis.com/ |
| NC OneMap Parcels | Standardized parcels | NC OneMap | Statewide NC | ArcGIS/open data/download | Public | High for statewide fallback | High | Use Now | NC Parcels Transformer standardizes parcel data from all counties; dataset includes core cadastral attributes. https://www.nconemap.gov/pages/parcels |
| Census ACS API | Demographics/growth | U.S. Census Bureau | National; block group/tract/county | API | Public; key optional/available | High | High | Use Now | ACS API supports programmatic access without storing large extracts. https://www.census.gov/programs-surveys/acs/data/data-via-api.html |
| Census LEHD LODES | Employment/commuting | U.S. Census Bureau | National census blocks | Bulk CSV downloads | Public | High after ETL | High | Prototype | LODES used by OnTheMap is downloadable. https://lehd.ces.census.gov/data/ |
| NC OSBM projections | Population projections | NC OSBM | NC county/state/municipal | CSV/Excel downloads | Public | High | High | Use Now | County/state projections available through 2060. https://www.osbm.nc.gov/facts-figures/population-demographics/state-demographer/countystate-population-projections |
| NCDOT AADT Stations/Segments | Traffic context | NCDOT | Statewide NC | ArcGIS REST/web map/download | Public | High | High | Use Now | AADT is traffic context, not demand proof. https://connect.ncdot.gov/resources/State-Mapping/pages/traffic-volume-maps.aspx |
| NCDOT STIP projects | Transportation investment | NCDOT | Statewide NC | ArcGIS REST/map | Public | High | High | Use Now | STIP project lines/points are available through NCDOT map services. https://gis11.services.ncdot.gov/arcgis/rest/services/NCDOT_STIP/MapServer |
| CRTPO CTP/MTP | Regional mobility plans | CRTPO | Charlotte region | Web maps/plans | Public | Medium-high | Medium-high | Prototype | Useful for long-range corridor context. https://crtpo.org/resources/maps-gis/ |
| FEMA NFHL | Flood hazard | FEMA | National | MSC, web services, downloads | Public | High | Already used | Use Now | MSC is official public source for NFIP flood hazard information. https://msc.fema.gov/ |
| USFWS National Wetlands Inventory | Wetlands | U.S. Fish & Wildlife Service | National | Mapper, downloads, web services | Public | High | High | Prototype | Download by HUC8/state in geodatabase/GeoPackage. https://www.fws.gov/program/national-wetlands-inventory/data-download |
| USGS 3DEP | Elevation/slope | USGS | National | ImageServer/WMS/WCS/downloads | Public | High | Medium | Prototype | 3DEP provides high-quality topographic/elevation data. https://www.usgs.gov/3d-elevation-program |
| EPA ECHO | Regulated facilities | EPA | National | REST-like GET web services | Public | High | High | Prototype | Public services return JSON/XML/JSONP. https://echo.epa.gov/tools/web-services |
| EPA Envirofacts | Environmental facilities/programs | EPA | National | REST API | Public | Medium-high | Medium-high | Prototype | Single point of access to EPA environmental databases. https://www.epa.gov/enviro/envirofacts-data-service-api |
| NC DEQ water resources/open data | Water/environment | NC DEQ | NC | Open data, maps, downloads | Public | Medium-high | Medium | Future Phase | Good for water-source/watershed context, not capacity confirmation. https://www.deq.nc.gov/about/divisions/water-resources/water-resources-data-statistics-and-maps |
| FCC National Broadband Map data | Broadband | FCC | National | Download/API with token workflow | Public data; API token workflow | Medium | Medium | Future Phase | Use as broadband availability context only. https://broadbandmap.fcc.gov/data-download |
| EIA-861 service territory data | Electric service territory | U.S. EIA | Utility/county/state | Downloads | Public | Medium | Medium | Future Phase | County-level utility service equipment data; not parcel service confirmation. https://www.eia.gov/electricity/data/eia861/ |
| Zillow/Bridge public records | Property records/listings | Zillow Group / Bridge | National where licensed | API/request access | Approval/licensing required | Medium if licensed | Low until approved | Evaluate License | Public records API advertises property/tax/transaction records; MLS listings are invite-only/discretionary. https://www.bridgeinteractive.com/developers/zillow-group-data/ |
| Crexi Listing API | Listings | Crexi | Commercial listings | Partner/listing API | Qualifying orgs; one-way listing sync | Low for CFS ingestion | Low | Reject for now | Listing API pushes listings to Crexi, not a broad pull feed for CFS. https://learn.crexi.com/listing-api-overview-crexi-help-center |
| CoStar | CRE market/property data | CoStar | Commercial markets | Licensed platform/data | Enterprise commercial | High if licensed | Low without license | Evaluate License | Strong CRE data but likely costly/restricted; not needed before public data maturity. https://www.costar.com/products/property-records |
| LandWatch and similar listing portals | Listings | Private listing platforms | National | Website/terms; no official broad API found | Restricted/unclear | Low | Low | Reject scraping | Do not scrape without explicit official API/terms. LandWatch terms make use personal/non-transferable. https://www.landwatch.com/terms-conditions |
| Data Axle | Business activity | Data Axle | National business records | Commercial APIs | Paid/licensed | Medium if licensed | Low until licensed | Future Phase | Business density/useful POI context; commercial. https://www.data-axle.com/data-solutions/apis/ |
| BLS API | Employment/economy | BLS | National/local series | API | Public; no registration required | Medium | Medium | Future Phase | Good county/MSA labor context, less parcel-specific. https://www.bls.gov/bls/api_features.htm |
| BEA API | Regional economy | BEA | National/regional | API | Free key required | Medium | Low-medium | Future Phase | Useful macro context; not parcel-level. https://apps.bea.gov/api/signup/ |

## 3. Priority Tiers

### Tier 1: Free and authoritative

- Cabarrus GIS/Open Data, Land Records, and Register of Deeds verification workflows.
- NC OneMap parcels as standardized parcel fallback.
- Census ACS API for tract/block-group demographic features.
- LEHD LODES for workplace/residence employment and commuting context.
- NC OSBM county/municipal projections.
- NCDOT AADT and STIP, plus CRTPO plan layers.
- FEMA NFHL, USFWS NWI, USGS 3DEP, EPA ECHO/Envirofacts.

### Tier 2: Affordable or freemium

- FCC broadband data/API where token/download workflow is acceptable.
- BEA and BLS APIs for macro/regional economic context.
- Low-cost routing/geocoding services only if OpenStreetMap/native geometry is insufficient.
- Licensed local-government APIs if Cabarrus/municipal portals offer stable endpoints under clear reuse terms.

### Tier 3: Enterprise commercial

- CoStar, MLS/Bridge/Zillow Group data, Data Axle, specialty listing/market datasets.
- These may improve market liquidity, active listings, business density, and CRE trends, but they are not necessary before CFS has exhausted public sources.
- Avoid scraping listing platforms. Use only licensed APIs, partner feeds, or manual user-entered listing workflows.

## 4. Top Five Recommended Integrations

### 1. Cabarrus deed/sale qualification workflow

- Problem solved: IP-2B can classify sale quality only from price/year/deedbook/deedpage; it lacks deed type, transaction type, grantor/grantee caution flags, and official qualified-sale fields.
- Data gained: deed type, transaction instrument, multi-parcel evidence, sale verification notes, possibly qualified/non-qualified cues.
- Coverage: Cabarrus County.
- Cost/auth: public/manual or request access; no credentials should be committed.
- Licensing: verify county/public-record reuse and redistribution limits before automated ingestion.
- Refresh: monthly or quarterly; manual review accepted for internal CFS Investment.
- Backend architecture: `external_data_sources` registry entry plus optional deed-verification import table keyed by parcel/deedbook/deedpage.
- Storage: small normalized verification table; no owner/grantee display in panel.
- Privacy: do not expose owner, grantor/grantee, or mailing fields.
- Use: improves `sale_quality_band`, `basis_verification_flags`, and comparable confidence.
- Recommendation: Request Access / Manual Workflow first.

### 2. Census ACS demographic connector

- Problem solved: CFS has parcel/economic signals but limited demographic market context.
- Data gained: population, households, income, tenure, age, vehicle access, housing units.
- Coverage: block group, tract, county/municipality where supported.
- Cost/auth: public API; key optional but recommended for reliability.
- Licensing: public federal data; include attribution.
- Refresh: annually after ACS release.
- Backend architecture: small connector fetching selected variables by tract/block group; store tract/block-group facts.
- Storage: small census geography fact tables.
- Privacy: aggregate only; no personal records.
- Use: market-area context, not demand proof.
- Recommendation: Use Now.

### 3. LEHD LODES employment/commuting connector

- Problem solved: CFS lacks worker inflow/outflow and employment-center context.
- Data gained: origin-destination work flows, workplace/residence job counts, industry/worker segments.
- Coverage: census block; aggregate to tract/municipality/corridor.
- Cost/auth: public downloads.
- Licensing: public Census data with disclosure limitations; attribute.
- Refresh: when Census releases new LODES.
- Backend architecture: county-filtered downloader/ETL; aggregate before UI.
- Storage: moderate; filter to NC/Cabarrus/region before loading.
- Privacy: aggregate; obey small-count caveats.
- Use: employment access, daytime population, commute gravity context.
- Recommendation: Prototype.

### 4. NCDOT/CRTPO transportation context connector

- Problem solved: CFS has some AADT/STIP data, but CFS Investment needs refreshed traffic/project context and long-range regional plan signals.
- Data gained: AADT, traffic stations/segments, functional class, STIP project proximity, CTP/MTP corridor plans.
- Coverage: Cabarrus/NC/Charlotte region.
- Cost/auth: public ArcGIS/web services.
- Licensing: public agency attribution; verify export terms.
- Refresh: annual/quarterly or on source update.
- Backend architecture: ArcGIS REST connector with geometry filters around Cabarrus; update parcel proximity overlays.
- Storage: station/project layers plus parcel summary features.
- Privacy: none.
- Use: accessibility and transportation investment context; not proof of commercial demand.
- Recommendation: Use Now / Prototype for CRTPO layers.

### 5. Environmental due-diligence public layer pack

- Problem solved: CFS has flood, but not wetlands, slope, EPA facility proximity, soils, or broader physical diligence context.
- Data gained: NWI wetlands, 3DEP slope/elevation, EPA regulated facility proximity, Envirofacts program records, later NRCS soils.
- Coverage: national/public layers.
- Cost/auth: public; no secrets.
- Licensing: public agency attribution; verify redistribution for downloaded extracts.
- Refresh: annual or source-driven.
- Backend architecture: one `environmental_screening` feature group with source-specific tables and parcel overlays.
- Storage: moderate; county-clipped layers only.
- Privacy: none.
- Use: constraint flags and due-diligence checklist.
- Recommendation: Prototype.

## 5. Sources Rejected or Deferred

- Zillow/Bridge MLS listings: useful only after approval/license. Defer until a user has rights and clear redistribution terms.
- Crexi Listing API: current public help describes a one-way sync to publish listings to Crexi, not a general pull API for CFS. Reject for this phase.
- CoStar: high-value enterprise CRE data, but costly/restricted. Evaluate only after public data and manual workflows prove ROI.
- LandWatch/LoopNet/Realtor/Zillow/Crexi website scraping: reject unless official API/terms explicitly allow the use case.
- Data Axle: promising for business density/POI context, but paid/licensed. Future phase.
- BEA/BLS macro data: safe and public, but lower parcel-level value than ACS/LEHD/NCDOT/environmental sources.

## 6. Connector Architecture

Keep this small and consistent with current FastAPI/PostGIS patterns.

Proposed structure:

```text
backend/app/connectors/
backend/app/connectors/base.py
backend/app/connectors/census.py
backend/app/connectors/lehd.py
backend/app/connectors/arcgis_public.py
backend/app/connectors/environmental.py
backend/app/services/external_data_registry.py
backend/app/services/external_data_refresh_service.py
config/investment_data_sources.json
```

Connector contract:

- `source_id`, `source_name`, `source_version`
- request URL or download URL, with no secrets
- license/attribution notes
- coverage geometry or FIPS/geography filter
- last checked and last refreshed
- schema validation
- timeout/rate-limit handling
- cache location
- status: enabled/disabled/prototype
- failure behavior: partial context and caveat, never fake values

Do not create connectors for rejected or inaccessible commercial sources. Do not put API keys in config. If an API key is needed later, load it from environment and show only whether it is configured.

## 7. Data-Source Registry Design

The file `config/investment_data_sources.json` should remain metadata-only:

```text
source_id
source_name
category
authority_level
access_method
status
last_checked
last_refreshed
coverage
license_summary
attribution
data_quality_band
refresh_schedule
connector_name
enabled
```

This can later power a CFS Investment data-readiness view without exposing credentials.

## 8. Refresh Strategy

- Government static/open data: monthly or quarterly.
- ACS/OSBM/BLS/BEA: annual or source-release driven.
- LEHD LODES: source-release driven; aggregate before storing.
- NCDOT AADT/STIP and CRTPO: quarterly/source-release driven.
- Environmental layers: annual/source-release driven, county-clipped.
- Commercial/listing feeds: only under license; cache according to contract.

## 9. Privacy and Safety Rules

- Do not expose owner names, mailing addresses, grantor/grantee names, or raw deed records.
- Do not expose raw model scores, exact probabilities, hidden weights, or raw transaction values in public/demo contexts.
- Active listings and asking prices, if licensed later, are context only and not a recommendation.
- Traffic counts are traffic context, not proof of commercial demand.
- Permits/plans are pipeline signals, not proof of completion.
- Utility proximity is not confirmed service or capacity.
- Assessed values are assessor context, not appraisal or market value.

## 10. Next Implementation Phase

Phase IP-2D should add no more than two connectors:

1. Census ACS connector for tract/block-group demographic features.
2. NCDOT/ArcGIS public connector refresh for AADT/STIP/CRTPO layers, or LEHD LODES if employment context is preferred.

Deed/sale qualification should proceed in parallel as an access/legal workflow, because it is likely the highest-value improvement but may require manual or county-specific access handling.
