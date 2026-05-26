"use client";

import { useCallback, useMemo, useState } from "react";
import {
  getDefaultPrintableViewMode,
  getDefaultReportExportIntent,
  getDefaultReportPackageId,
  mockReportExportAdapter,
  resolveReportPackageForIntent,
} from "@/lib/dashboard/reportExportAdapter";
import type {
  ExportFormat,
  ExportJobState,
  MockExportHistoryItem,
  PrintableViewMode,
  ReportExportIntent,
  ReportExportResult,
  ReportPackageId,
} from "@/types/reports";

export function useExecutiveReports() {
  const [activeReportPackageId, setActiveReportPackageId] =
    useState<ReportPackageId>(getDefaultReportPackageId());
  const [printableViewMode, setPrintableViewMode] =
    useState<PrintableViewMode>(getDefaultPrintableViewMode());
  const [reportExportIntent, setReportExportIntent] =
    useState<ReportExportIntent>(getDefaultReportExportIntent());
  const [exportJobState, setExportJobState] =
    useState<ExportJobState>("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportHistory, setExportHistory] = useState<MockExportHistoryItem[]>(
    [],
  );
  const [lastExportResult, setLastExportResult] =
    useState<ReportExportResult | null>(null);

  const reportPackages = useMemo(
    () => mockReportExportAdapter.getReportPackages(),
    [],
  );
  const activeReportPackage = useMemo(
    () => mockReportExportAdapter.getReportPackage(activeReportPackageId),
    [activeReportPackageId],
  );
  const activeBriefingPacket = useMemo(
    () =>
      mockReportExportAdapter.exportToPrintView(
        activeReportPackageId,
        printableViewMode,
      ),
    [activeReportPackageId, printableViewMode],
  );

  const selectReportPackage = useCallback((packageId: ReportPackageId) => {
    setActiveReportPackageId(packageId);
  }, []);

  const setReportIntent = useCallback((intent: ReportExportIntent) => {
    setReportExportIntent(intent);
    setActiveReportPackageId(resolveReportPackageForIntent(intent));
  }, []);

  const openPrintLayout = useCallback((mode: PrintableViewMode) => {
    setPrintableViewMode(mode);
    setExportJobState("ready");
    setExportProgress(100);
  }, []);

  const runMockExport = useCallback(
    (format: ExportFormat) => {
      setExportJobState("preparing");
      setExportProgress(64);

      const result =
        format === "pdf"
          ? mockReportExportAdapter.exportToPdf(activeReportPackageId)
          : {
              format,
              jobId: `mock-export-${activeReportPackageId}-${format}`,
              message: `Mock ${format.toUpperCase()} export prepared.`,
              packageId: activeReportPackageId,
              state: "complete" as const,
            };

      setLastExportResult(result);
      setExportJobState(result.state);
      setExportProgress(100);
      setExportHistory((currentHistory) => [
        {
          completedAt: new Date().toISOString(),
          format,
          id: result.jobId,
          packageId: activeReportPackageId,
          title: activeReportPackage.title,
        },
        ...currentHistory,
      ]);

      return result;
    },
    [activeReportPackage.title, activeReportPackageId],
  );

  const generateBoardBrief = useCallback(() => {
    const reportPackage = mockReportExportAdapter.generateBoardPacket();

    setReportExportIntent("board");
    setActiveReportPackageId(reportPackage.id);
    setPrintableViewMode("board-packet");
    setExportJobState("ready");
    setExportProgress(100);

    return reportPackage;
  }, []);

  const exportScenarioComparison = useCallback(() => {
    const reportPackage = mockReportExportAdapter.exportScenarioComparison();
    const result = mockReportExportAdapter.exportToPdf(reportPackage.id);

    setReportExportIntent("scenario");
    setActiveReportPackageId(reportPackage.id);
    setPrintableViewMode("briefing");
    setLastExportResult(result);
    setExportJobState(result.state);
    setExportProgress(100);
    setExportHistory((currentHistory) => [
      {
        completedAt: new Date().toISOString(),
        format: "pdf",
        id: result.jobId,
        packageId: reportPackage.id,
        title: reportPackage.title,
      },
      ...currentHistory,
    ]);

    return result;
  }, []);

  return {
    activeBriefingPacket,
    activeReportPackage,
    activeReportPackageId,
    exportHistory,
    exportJobState,
    exportProgress,
    exportScenarioComparison,
    generateBoardBrief,
    lastExportResult,
    openPrintLayout,
    printableViewMode,
    reportExportIntent,
    reportPackages,
    runMockExport,
    selectReportPackage,
    setPrintableViewMode,
    setReportIntent,
  };
}
