export const PARCEL_SEARCH_INSPECT_EVENT = "cfs:inspect-intelligence-parcel";

export interface ParcelSearchFilters {
  governanceWarningCategory: string;
  neighborhood: string;
  parcelQualityStatus: string;
  parcelSizeCategory: string;
  safeForDashboard: string;
  subdivision: string;
  valuationBand: string;
  zoningCategory: string;
  zoningCode: string;
  zoningConfidence: string;
  zoningJurisdiction: string;
}

export interface ParcelSearchEventDetail {
  officialParcelId: string;
}

export const emptyParcelSearchFilters: ParcelSearchFilters = {
  governanceWarningCategory: "",
  neighborhood: "",
  parcelQualityStatus: "",
  parcelSizeCategory: "",
  safeForDashboard: "",
  subdivision: "",
  valuationBand: "",
  zoningCategory: "",
  zoningCode: "",
  zoningConfidence: "",
  zoningJurisdiction: "",
};

export const parcelSearchFilterLabels: Record<keyof ParcelSearchFilters, string> =
  {
    governanceWarningCategory: "Governance Warning",
    neighborhood: "Neighborhood",
    parcelQualityStatus: "Parcel Quality",
    parcelSizeCategory: "Parcel Size",
    safeForDashboard: "Dashboard Safe",
    subdivision: "Subdivision",
    valuationBand: "Valuation Band",
    zoningCategory: "Zoning Category",
    zoningCode: "Zoning Code",
    zoningConfidence: "Zoning Confidence",
    zoningJurisdiction: "Zoning Jurisdiction",
  };
