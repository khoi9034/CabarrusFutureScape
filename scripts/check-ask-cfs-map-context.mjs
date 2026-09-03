import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [panel, shell, scene, service, router, schema, types] = await Promise.all([
  readFile("src/components/dashboard/AskCfsPanel.tsx", "utf8"),
  readFile("src/components/layout/AppShell.tsx", "utf8"),
  readFile("src/components/gis/SceneViewContainer.tsx", "utf8"),
  readFile("src/lib/aiSearchService.ts", "utf8"),
  readFile("backend/app/routers/ai_search_router.py", "utf8"),
  readFile("backend/app/schemas/ai_search.py", "utf8"),
  readFile("src/types/api/aiSearch.ts", "utf8"),
]);

assert.match(shell, /mapAware: cfsAppMode === "planning"/);
assert.match(panel, /captureAskCfsMapContext/);
assert.match(panel, /map_context: mapContext/);
assert.match(panel, /Context: Current Planning map/);
assert.match(scene, /title: layer\.title \|\| layer\.id/);
assert.match(types, /interface CfsAiMapContext/);
assert.match(schema, /class CfsAiMapContext/);
assert.match(router, /ST_MakeEnvelope/);
assert.match(router, /ST_Intersects/);
assert.match(router, /LIMIT 5/);
assert.match(service, /demoMapExtentAnswer/);
assert.match(service, /The map view changed/);
assert.match(service, /Summarize this map view/);
assert.doesNotMatch(panel, /owner_name|mailaddr|permit_notes/);

console.log("PASS Builder Planning Ask CFS map-context contract");
