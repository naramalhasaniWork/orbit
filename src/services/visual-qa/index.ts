export { compareScreenshots, type DiffResult, type DiffRegion } from "./diff-engine";
export { checkBrandConsistency, type BrandCheckResult, type BrandIssue } from "./brand-checker";
export {
  getBaseline,
  setBaseline,
  updateBaseline,
  listBaselines,
  deleteBaseline,
  acceptAsBaseline,
  computeChecksum,
} from "./baseline-manager";
export { runVisualTest, type VisualTestInput, type VisualTestResult } from "./visual-test-runner";
