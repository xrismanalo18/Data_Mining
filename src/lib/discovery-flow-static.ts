// Static Process Discovery content, transcribed from Discovery_2026-07-06_flow.txt
// (FlowLens task-mining export, participant C9D3MD). Steps are ordered by first
// appearance in the chronological flow so they read left-to-right as the primary path.

export type DiscoveryApp = "Facets" | "FlowLens" | "ICA Host";

export type DiscoveryStep = {
  id: string;
  app: DiscoveryApp;
  exe: string;
  window: string;
  initials: string;
  seconds: number;
  samples: number;
  keys: number;
  clicks: number;
};

export type DiscoveryReturnEdge = { fromId: string; toId: string };

export type DiscoveryLoop = { aId: string; bId: string; switches: number };

export const APP_COLORS: Record<DiscoveryApp, string> = {
  Facets: "#2a78d6",
  FlowLens: "#eb6834",
  "ICA Host": "#4a3aa7",
};

export const DISCOVERY_FLOW = {
  meta: {
    participant: "C9D3MD",
    capturedOn: "2026-07-06",
    started: "09:43:02",
    ended: "09:44:57",
    observedSeconds: 114,
    samples: 90,
    interactions: 91,
    transitions: 22,
    keystrokes: 49,
    clicks: 42,
    sessions: 1,
  },
  steps: [
    { id: "flowlens", app: "FlowLens", exe: "FlowLens-Task-Mining (1).exe", window: "FlowLens Task Mining 0.1.0", initials: "FL", seconds: 4, samples: 4, keys: 0, clicks: 2 },
    { id: "ica-host", app: "ICA Host", exe: "WfShell.exe", window: "ICA Seamless Host Agent", initials: "ICA", seconds: 1, samples: 2, keys: 0, clicks: 1 },
    { id: "facets", app: "Facets", exe: "ceraexe0.exe", window: "Facets", initials: "Fa", seconds: 3, samples: 6, keys: 0, clicks: 3 },
    { id: "claims-inquiry-all", app: "Facets", exe: "ceraexe0.exe", window: "Facets - Claims Inquiry - All", initials: "CA", seconds: 20, samples: 13, keys: 4, clicks: 5 },
    { id: "claims-inquiry", app: "Facets", exe: "ceraexe0.exe", window: "Claims Inquiry", initials: "CI", seconds: 3, samples: 3, keys: 4, clicks: 2 },
    { id: "claims-inquiry-results", app: "Facets", exe: "ceraexe0.exe", window: "Claims Inquiry Results", initials: "CR", seconds: 1, samples: 2, keys: 0, clicks: 1 },
    { id: "mcp-unassigned", app: "Facets", exe: "ceraexe0.exe", window: "Facets - Medical Claims Processing - Unassigned", initials: "MU", seconds: 0, samples: 2, keys: 0, clicks: 0 },
    { id: "facets-workflow", app: "Facets", exe: "ceraexe0.exe", window: "Facets - Workflow", initials: "WF", seconds: 2, samples: 2, keys: 0, clicks: 1 },
    { id: "mcp-gupta", app: "Facets", exe: "ceraexe0.exe", window: "Facets - Medical Claims Processing - GUPTA, ASHOK [Read Only]", initials: "MC", seconds: 42, samples: 29, keys: 11, clicks: 12 },
    { id: "warning-messages", app: "Facets", exe: "ceraexe0.exe", window: "Warning Messages", initials: "WM", seconds: 5, samples: 4, keys: 3, clicks: 1 },
    { id: "warning-history-notes", app: "Facets", exe: "ceraexe0.exe", window: "Warning/History/Notes", initials: "WH", seconds: 5, samples: 4, keys: 0, clicks: 4 },
    { id: "line-item-external-price", app: "Facets", exe: "ceraexe0.exe", window: "Line Item External Price", initials: "LI", seconds: 13, samples: 8, keys: 7, clicks: 6 },
    { id: "note-attachment", app: "Facets", exe: "ceraexe0.exe", window: "Note Attachment", initials: "NA", seconds: 8, samples: 6, keys: 20, clicks: 3 },
    { id: "ceraexe0", app: "Facets", exe: "ceraexe0.exe", window: "ceraexe0.exe", initials: "CX", seconds: 1, samples: 2, keys: 0, clicks: 1 },
  ] as DiscoveryStep[],
  // Observed transitions that go back to an earlier step in the primary path.
  returnEdges: [
    { fromId: "claims-inquiry", toId: "facets" },
    { fromId: "claims-inquiry-results", toId: "claims-inquiry-all" },
    { fromId: "claims-inquiry-all", toId: "facets" },
    { fromId: "warning-messages", toId: "mcp-gupta" },
    { fromId: "warning-history-notes", toId: "mcp-gupta" },
    { fromId: "line-item-external-price", toId: "mcp-gupta" },
    { fromId: "note-attachment", toId: "mcp-gupta" },
    { fromId: "ceraexe0", toId: "mcp-gupta" },
  ] as DiscoveryReturnEdge[],
  reworkLoops: [
    { aId: "mcp-gupta", bId: "warning-messages", switches: 2 },
    { aId: "mcp-gupta", bId: "warning-history-notes", switches: 2 },
    { aId: "mcp-gupta", bId: "line-item-external-price", switches: 2 },
    { aId: "mcp-gupta", bId: "note-attachment", switches: 2 },
    { aId: "facets", bId: "claims-inquiry-all", switches: 2 },
  ] as DiscoveryLoop[],
};
