// The tenant guard throws in every test (it would anyway outside production; this makes it explicit),
// so a route query that skips its tenant filter fails the suite instead of shipping.
process.env.ORBIT_TENANT_GUARD = "throw";
