import { readFile } from "node:fs/promises";
import path from "node:path";

const ARTIFACTS = {
  "CFS_Development_Land_Acquisition_Review.pptx": {
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    disposition: "attachment",
    path: "case-studies/large-development-land/CFS_Development_Land_Acquisition_Review.pptx",
  },
  "CFS_Development_Land_Underwriting.xlsx": {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    disposition: "attachment",
    path: "case-studies/large-development-land/CFS_Development_Land_Underwriting.xlsx",
  },
  "cfs-investment-acquisition-presentation.md": {
    contentType: "text/markdown; charset=utf-8",
    disposition: "inline",
    path: "docs/case-studies/cfs-investment-acquisition-presentation.md",
  },
  "cfs-investment-executive-recommendation.md": {
    contentType: "text/markdown; charset=utf-8",
    disposition: "inline",
    path: "docs/case-studies/cfs-investment-executive-recommendation.md",
  },
  "cfs-investment-interview-walkthrough.md": {
    contentType: "text/markdown; charset=utf-8",
    disposition: "inline",
    path: "docs/case-studies/cfs-investment-interview-walkthrough.md",
  },
  "cfs-investment-large-development-land.md": {
    contentType: "text/markdown; charset=utf-8",
    disposition: "inline",
    path: "docs/case-studies/cfs-investment-large-development-land.md",
  },
  "final_diagnostic_exhibits.json": {
    contentType: "application/json; charset=utf-8",
    disposition: "inline",
    path: "case-studies/large-development-land/final_diagnostic_exhibits.json",
  },
} as const;

type ArtifactName = keyof typeof ARTIFACTS;

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artifact: string }> },
) {
  const { artifact } = await params;
  const item = ARTIFACTS[artifact as ArtifactName];

  if (!item) {
    return new Response("Artifact not found", { status: 404 });
  }

  try {
    const file = await readFile(path.join(process.cwd(), item.path));

    return new Response(new Uint8Array(file), {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Disposition": `${item.disposition}; filename="${artifact}"`,
        "Content-Type": item.contentType,
      },
    });
  } catch {
    return new Response("Artifact unavailable", { status: 404 });
  }
}
