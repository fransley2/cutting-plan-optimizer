import assert from "node:assert/strict";
import {
  CHECK_STATUS,
  validateCuttingPackage
} from "../src/core/cuttingPackageValidation.js";

function basePackage() {
  return {
    id: "CP-001",
    project: "RAIA",
    metadata: {
      project: "RAIA",
      materialCouponNumber: "MC-001",
      cuttingSheetNumber: "CS-001",
      rmvNumber: "RMV-001"
    },
    mtoItems: [
      {
        id: "MTO-1",
        project: "RAIA",
        drawing: "DWG-001",
        mark: "M-01",
        qty: 2,
        length: 1000,
        materialGrade: "S355J2"
      },
      {
        id: "MTO-2",
        projectName: "RAIA",
        drawingRef: "DWG-002",
        pos: "P-02",
        quantity: 1,
        lengthMm: 500,
        material: "S355 J2"
      }
    ],
    stockItems: [
      {
        id: "STK-1",
        traceability: "TR-001",
        po: "PO-1",
        item: "10",
        heatNumber: "H-001",
        materialGrade: "S355J2"
      }
    ],
    nestedBars: [
      {
        pieces: [
          { id: "P-1", length: 1000 },
          { id: "P-2", length: 1000 },
          { id: "P-3", length: 500 }
        ]
      }
    ],
    unallocatedParts: [],
    generatedOffcuts: [
      { id: "OC-1", length: 250, classification: "USABLE" }
    ],
    materialCoupon: {
      documentNumber: "MC-001",
      cuttingPackageId: "CP-001"
    },
    cuttingSheet: {
      documentNumber: "CS-001",
      packageId: "CP-001"
    },
    returnMaterialVoucher: {
      documentNumber: "RMV-001",
      metadata: { cuttingPackageId: "CP-001" }
    },
    auditEntries: [
      { id: "AUD-1", action: "CREATE_CUTTING_PACKAGE" }
    ]
  };
}

function clone(value) {
  return structuredClone(value);
}

function getCheck(result, id) {
  return result.checklist.find((item) => item.id === id);
}

function hasBlocking(result, id) {
  return result.blockingErrors.some((item) => item.id === id);
}

function hasWarning(result, id) {
  return result.warnings.some((item) => item.id === id);
}

function run() {
  {
    const result = validateCuttingPackage(basePackage());
    assert.equal(result.valid, true);
    assert.equal(result.blockingErrors.length, 0);
    assert.equal(result.checklist.length, 15);
  }

  {
    const pkg = basePackage();
    pkg.project = "";
    pkg.metadata.project = "";
    pkg.mtoItems.forEach((item) => {
      delete item.project;
      delete item.projectName;
    });
    const result = validateCuttingPackage(pkg);
    assert.equal(result.valid, false);
    assert.equal(hasBlocking(result, "PROJECT_REQUIRED"), true);
  }

  {
    const pkg = basePackage();
    delete pkg.mtoItems[0].drawing;
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "DRAWING_REQUIRED"), true);
  }

  {
    const pkg = basePackage();
    delete pkg.mtoItems[0].mark;
    delete pkg.mtoItems[0].pos;
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "MARK_OR_POS_REQUIRED"), true);
  }

  {
    const pkg = basePackage();
    pkg.mtoItems[0].length = 0;
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "LENGTH_REQUIRED"), true);
  }

  {
    const pkg = basePackage();
    delete pkg.mtoItems[0].materialGrade;
    delete pkg.mtoItems[0].material;
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "MATERIAL_GRADE_REQUIRED"), true);
  }

  {
    const pkg = basePackage();
    delete pkg.stockItems[0].traceability;
    delete pkg.stockItems[0].id;
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "STOCK_TRACEABILITY_REQUIRED"), true);
  }

  {
    const pkg = basePackage();
    delete pkg.stockItems[0].item;
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "STOCK_PO_ITEM_REQUIRED"), true);
  }

  {
    const pkg = basePackage();
    delete pkg.stockItems[0].heatNumber;
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "STOCK_HEAT_REQUIRED"), true);
  }

  {
    const pkg = basePackage();
    pkg.stockItems[0].materialGrade = "A36";
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "MATERIAL_COMPATIBILITY"), true);
  }

  {
    const pkg = basePackage();
    pkg.nestedBars[0].pieces = [{ id: "P-1", length: 1000 }];
    pkg.unallocatedParts = [];
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "REQUIRED_QUANTITY_COVERED"), true);
    assert.equal(hasBlocking(result, "UNALLOCATED_PARTS_LISTED"), true);
  }

  {
    const pkg = basePackage();
    pkg.nestedBars[0].pieces = [{ id: "P-1", length: 1000 }];
    pkg.unallocatedParts = [{ id: "MTO-2#1" }];
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "REQUIRED_QUANTITY_COVERED"), true);
    assert.equal(hasWarning(result, "UNALLOCATED_PARTS_LISTED"), true);
  }

  {
    const pkg = basePackage();
    pkg.generatedOffcuts = [{ id: "OC-1", length: 300 }];
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "OFFCUTS_CLASSIFIED"), true);
  }

  {
    const pkg = basePackage();
    pkg.metadata.cuttingSheetNumber = "MC-001";
    pkg.cuttingSheet.documentNumber = "MC-001";
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "DOCUMENT_NUMBERS_UNIQUE"), true);
  }

  {
    const pkg = basePackage();
    pkg.cuttingSheet.packageId = "CP-999";
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "DOCUMENTS_LINKED_TO_PACKAGE"), true);
  }

  {
    const pkg = basePackage();
    pkg.auditEntries = [];
    const result = validateCuttingPackage(pkg);
    assert.equal(hasBlocking(result, "AUDIT_LOG_GENERATED"), true);
  }

  {
    const pkg = basePackage();
    const before = clone(pkg);
    validateCuttingPackage(pkg);
    assert.deepEqual(pkg, before);
  }

  {
    const pkg = basePackage();
    pkg.mtoItems[0].length = "1742,69";
    const result = validateCuttingPackage(pkg);
    assert.equal(getCheck(result, "LENGTH_REQUIRED").status, CHECK_STATUS.PASS);
  }

  {
    const pkg = basePackage();
    pkg.mtoItems[0].materialGrade = "DNV25CR";
    pkg.mtoItems[1].material = "DNV 25CR";
    pkg.stockItems[0].materialGrade = "S32760";
    const result = validateCuttingPackage(pkg, {
      materialAliases: {
        DNV25CR: ["DNV 25CR", "DNV25Cr", "S32760"]
      }
    });
    assert.equal(getCheck(result, "MATERIAL_COMPATIBILITY").status, CHECK_STATUS.PASS);
  }

  console.log("cutting package validation tests passed");
}

run();
