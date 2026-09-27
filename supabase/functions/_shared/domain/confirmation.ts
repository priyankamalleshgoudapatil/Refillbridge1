// Binds exactly what the provider saw on the order-restating screen to what is saved (§9 F4).
export interface ConfirmableOrder {
  caseId: string;
  patientId: string;
  decision: string;
  medicationName: string;
  strength: string;
  quantity: number;
  daysSupply: number;
  refills: number;
  bridgeDays?: number | null;
  pharmacyId: string;
}

/** FNV-1a 32-bit over a canonical string. Server recomputes and compares. */
export function orderConfirmationHash(o: ConfirmableOrder): string {
  const canonical = [
    o.caseId,
    o.patientId,
    o.decision,
    o.medicationName.trim().toLowerCase(),
    o.strength.trim().toLowerCase(),
    o.quantity,
    o.daysSupply,
    o.refills,
    o.bridgeDays ?? '',
    o.pharmacyId,
  ].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
