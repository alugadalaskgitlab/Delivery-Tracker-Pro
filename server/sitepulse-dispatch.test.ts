import test from "node:test";
import assert from "node:assert/strict";
import type { Dispatch } from "@shared/schema";
import { formatSitePulseValidationError, sitePulseCreateDispatchSchema, sitePulseUpdateDispatchSchema, createDispatchAndNotify } from "./sitepulse-dispatch";

const party = { id: "party-1", partyName: "Example Party", partyCode: "EX" } as any;
const site = {
  id: "site-1",
  siteCode: "SITE",
  siteName: "Example Site",
  accessId: "test-link",
  mixType: "BC",
  notifyMobile: null,
} as any;

function createDependencies() {
  let savedInput: Record<string, any> | undefined;
  let nextSequenceCalls = 0;
  let pushCalls = 0;
  let emittedCalls = 0;
  const dependencies = {
    storage: {
      incrementChallanSequence: async () => {
        nextSequenceCalls += 1;
        return 7;
      },
      createDispatch: async (input: Record<string, any>) => {
        savedInput = input;
        return { ...input, id: "dispatch-1" } as Dispatch;
      },
    },
    emitNewDispatch: () => {
      emittedCalls += 1;
    },
    sendSiteNotification: async () => {
      pushCalls += 1;
    },
    triggerSiteNotification: async () => {},
  };
  return {
    dependencies,
    getSavedInput: () => savedInput,
    getCounts: () => ({ nextSequenceCalls, pushCalls, emittedCalls }),
  };
}

const validCreate = {
  externalRef: "sp-test-1",
  siteId: "site-1",
  vehicleNo: " ts 15t 4059 ",
  loadMT: 30.5,
};

test("POST schema accepts null, missing, empty, and whitespace-only optional details", () => {
  const nullFields = sitePulseCreateDispatchSchema.safeParse({
    ...validCreate,
    driverName: null,
    driverMobile: null,
    notes: null,
    mixType: null,
  });
  assert.equal(nullFields.success, true);
  if (nullFields.success) {
    assert.equal(nullFields.data.driverName, undefined);
    assert.equal(nullFields.data.driverMobile, undefined);
    assert.equal(nullFields.data.notes, undefined);
    assert.equal(nullFields.data.mixType, undefined);
  }

  const blankFields = sitePulseCreateDispatchSchema.safeParse({
    ...validCreate,
    driverName: "   ",
    driverMobile: "",
    notes: "  ",
    mixType: " ",
  });
  assert.equal(blankFields.success, true);
  if (blankFields.success) {
    assert.equal(blankFields.data.driverName, undefined);
    assert.equal(blankFields.data.driverMobile, undefined);
    assert.equal(blankFields.data.notes, undefined);
    assert.equal(blankFields.data.mixType, undefined);
  }
  assert.equal(sitePulseCreateDispatchSchema.safeParse(validCreate).success, true);
});

test("mock POST creation assigns a challan and calls the dispatch notification flow", async () => {
  const parsed = sitePulseCreateDispatchSchema.parse({
    ...validCreate,
    driverName: null,
    driverMobile: null,
    notes: null,
    mixType: null,
  });
  const mock = createDependencies();
  const dispatch = await createDispatchAndNotify({
    ...parsed,
    party,
    site,
    externalSource: "SITEPULSE",
  }, mock.dependencies);

  assert.equal(dispatch.challanNo, "SITE-0007");
  assert.equal(mock.getSavedInput()?.vehicleNo, "TS 15T 4059");
  assert.equal(mock.getSavedInput()?.driverName, null);
  assert.equal(mock.getSavedInput()?.driverMobile, null);
  assert.equal(mock.getSavedInput()?.mixType, "BC");
  assert.deepEqual(mock.getCounts(), { nextSequenceCalls: 1, pushCalls: 1, emittedCalls: 1 });
});

test("filled POST driver details are trimmed and vehicle number is upper-case", async () => {
  const parsed = sitePulseCreateDispatchSchema.parse({
    ...validCreate,
    driverName: "  DRIVER ONE  ",
    driverMobile: "  9876543210 ",
  });
  const mock = createDependencies();
  await createDispatchAndNotify({ ...parsed, party, site }, mock.dependencies);

  assert.equal(mock.getSavedInput()?.vehicleNo, "TS 15T 4059");
  assert.equal(mock.getSavedInput()?.driverName, "DRIVER ONE");
  assert.equal(mock.getSavedInput()?.driverMobile, "9876543210");
});

test("PATCH accepts null optional fields as not provided", () => {
  const result = sitePulseUpdateDispatchSchema.safeParse({
    driverName: null,
    driverMobile: null,
    notes: null,
    mixType: null,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.driverName, undefined);
    assert.equal(result.data.driverMobile, undefined);
    assert.equal(result.data.notes, undefined);
    assert.equal(result.data.mixType, undefined);
  }
});

test("missing required POST vehicle number returns a plain field-specific error", () => {
  const result = sitePulseCreateDispatchSchema.safeParse({
    externalRef: "sp-test-2",
    siteId: "site-1",
    loadMT: 30.5,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(formatSitePulseValidationError(result.error), "vehicleNo is missing");
  }
});
