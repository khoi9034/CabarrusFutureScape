"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildTemporalQueryPreview,
  defaultTemporalDateRange,
  developmentTemporalIndex,
  getTemporalQueryResult,
  getTemporalTrendSummary,
  type DevelopmentTemporalFilters,
  type TemporalDateRange,
} from "@/data/intelligence/developmentTemporalIndex";

export function useTemporalAnalysisState() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedDateRange, setSelectedDateRange] =
    useState<TemporalDateRange>(defaultTemporalDateRange);
  const [selectedPermitType, setSelectedPermitType] = useState<string | null>(
    null,
  );
  const [selectedRollingWindow, setSelectedRollingWindow] = useState<
    12 | 36 | null
  >(null);
  const [selectedWorkType, setSelectedWorkType] = useState<string | null>(null);
  const [selectedZoningCategory, setSelectedZoningCategory] = useState<
    string | null
  >(null);
  const [selectedZoningJurisdiction, setSelectedZoningJurisdiction] = useState<
    string | null
  >(null);
  const [selectedActivityClass, setSelectedActivityClass] = useState<
    string | null
  >(null);

  const temporalFilters: DevelopmentTemporalFilters = useMemo(
    () => ({
      selectedActivityClass,
      selectedDateRange,
      selectedMonth,
      selectedPermitType,
      selectedRollingWindow,
      selectedWorkType,
      selectedZoningCategory,
      selectedYear,
      selectedZoningJurisdiction,
    }),
    [
      selectedActivityClass,
      selectedDateRange,
      selectedMonth,
      selectedPermitType,
      selectedRollingWindow,
      selectedWorkType,
      selectedZoningCategory,
      selectedYear,
      selectedZoningJurisdiction,
    ],
  );

  const setYear = useCallback((year: number | null) => {
    setSelectedYear(year);
    setSelectedMonth(null);
  }, []);

  const setMonth = useCallback((month: number | null) => {
    setSelectedMonth(month);
  }, []);

  const setDateRange = useCallback((dateRange: TemporalDateRange) => {
    setSelectedDateRange(dateRange);
  }, []);

  const setPermitType = useCallback((permitType: string | null) => {
    setSelectedPermitType(permitType);
  }, []);

  const setRollingWindow = useCallback((rollingWindow: 12 | 36 | null) => {
    setSelectedRollingWindow(rollingWindow);
  }, []);

  const setWorkType = useCallback((workType: string | null) => {
    setSelectedWorkType(workType);
  }, []);

  const setZoningCategory = useCallback((zoningCategory: string | null) => {
    setSelectedZoningCategory(zoningCategory);
  }, []);

  const setZoningJurisdiction = useCallback(
    (zoningJurisdiction: string | null) => {
      setSelectedZoningJurisdiction(zoningJurisdiction);
    },
    [],
  );

  const setActivityClass = useCallback((activityClass: string | null) => {
    setSelectedActivityClass(activityClass);
  }, []);

  const resetTemporalFilters = useCallback(() => {
    setSelectedYear(null);
    setSelectedMonth(null);
    setSelectedDateRange(defaultTemporalDateRange);
    setSelectedPermitType(null);
    setSelectedRollingWindow(null);
    setSelectedWorkType(null);
    setSelectedZoningCategory(null);
    setSelectedZoningJurisdiction(null);
    setSelectedActivityClass(null);
  }, []);

  const queryResult = useMemo(
    () => getTemporalQueryResult(temporalFilters),
    [temporalFilters],
  );

  const trendSummary = useMemo(
    () => getTemporalTrendSummary(temporalFilters),
    [temporalFilters],
  );

  const queryPreview = useMemo(
    () => buildTemporalQueryPreview(temporalFilters),
    [temporalFilters],
  );

  return {
    activityClasses: developmentTemporalIndex.activityClassMetadata,
    availableMonths: developmentTemporalIndex.availableMonths,
    availableYears: developmentTemporalIndex.availableYears,
    maxDate: developmentTemporalIndex.maxDate,
    minDate: developmentTemporalIndex.minDate,
    permitTypes: developmentTemporalIndex.permitTypes,
    queryPreview,
    queryResult,
    resetTemporalFilters,
    selectedActivityClass,
    selectedDateRange,
    selectedMonth,
    selectedPermitType,
    selectedRollingWindow,
    selectedWorkType,
    selectedZoningCategory,
    selectedYear,
    selectedZoningJurisdiction,
    setActivityClass,
    setDateRange,
    setMonth,
    setPermitType,
    setRollingWindow,
    setWorkType,
    setYear,
    setZoningCategory,
    setZoningJurisdiction,
    temporalFilters,
    trendSummary,
    workTypes: developmentTemporalIndex.workTypes,
    zoningCategories: developmentTemporalIndex.zoningCategories,
    zoningJurisdictions: developmentTemporalIndex.zoningJurisdictions,
  };
}

export type TemporalAnalysisState = ReturnType<typeof useTemporalAnalysisState>;
