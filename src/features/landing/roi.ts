export const PRICE_PER_PROVIDER = 149;

export interface RoiInputs {
  providers: number;
  refills: number;
  minutesPerRefill: number;
  hourlyCost: number;
  calls: number;
  minutesPerCall: number;
}

export const ROI_DEFAULTS: RoiInputs = { providers: 20, refills: 400, minutesPerRefill: 12, hourlyCost: 32, calls: 150, minutesPerCall: 6 };

export interface RoiResult {
  hoursSaved: number;
  monthlyValue: number;
  annualValue: number;
  monthlyCost: number;
  roiMultiple: number;
}

/** monthly value = refills × minutes ÷ 60 × cost + calls × minutesPerCall ÷ 60 × cost */
export function computeRoi(i: RoiInputs): RoiResult {
  const refillHours = (i.refills * i.minutesPerRefill) / 60;
  const callHours = (i.calls * i.minutesPerCall) / 60;
  const hoursSaved = refillHours + callHours;
  const monthlyValue = refillHours * i.hourlyCost + callHours * i.hourlyCost;
  const monthlyCost = i.providers * PRICE_PER_PROVIDER;
  return {
    hoursSaved,
    monthlyValue,
    annualValue: monthlyValue * 12,
    monthlyCost,
    roiMultiple: monthlyCost > 0 ? monthlyValue / monthlyCost : 0,
  };
}
