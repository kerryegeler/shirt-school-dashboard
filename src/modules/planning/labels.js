// Label lists shared by the desktop and phone versions of Yearly Planning.

export const BREAKDOWN = [
  ['challengeCash', 'Challenge cash collected'],
  ['newPlans', 'New payment plans (stacking)'],
  ['legacyPlans', '2026 payment plans still paying'],
  ['brandBrain', 'Brand Brain'],
  ['elite', 'Elite monthly (Elite launches)'],
  ['dropStudio', 'Drop Studio'],
  ['printeez', 'Printeez'],
  ['affiliates', 'Affiliates'],
]

export const STATUS = {
  ok: ['Covered', 'good'],
  tight: ['Tight', 'warn'],
  paydown: ['Pay down during ads', 'warn'],
  short: ['Short', 'bad'],
}

export const GROUPS = [
  ['What a challenge collects per ad dollar', [
    ['multBreakeven', 'Break-even', 'x'], ['multNormal', 'Normal', 'x'], ['multHomerun', 'Home run', 'x'],
    ['scaleAt', 'Budget where results soften', '$'], ['scaleHaircut', 'How much they soften', '%'],
  ]],
  ['Tickets', [
    ['cptBase', 'Cost per ticket at base spend', '$'], ['cptRef', 'Base spend', '$'], ['cptCurve', 'Cost rise as spend rises', 'x'],
  ]],
  ['Payment plans', [
    ['elitePlanRate', 'Elite plan starts per ticket', '%'], ['elitePlanStay', 'Elite plans that keep paying', '%'], ['elitePlanPrice', 'Elite monthly', '$'], ['elitePlanMonths', 'Elite months', 'n'],
    ['accelPlanRate', 'Accelerator plan starts per ticket', '%'], ['accelPlanStay', 'Accelerator plans that keep paying', '%'], ['accelPlanPrice', 'Accelerator monthly', '$'], ['accelPlanMonths', 'Accelerator months', 'n'],
    ['legacyPlans', '2026 plans still paying in Jan', '$'], ['legacyDecay', 'Monthly drop in 2026 plans', '%'],
  ]],
  ['Monthly income', [
    ['printeez', 'Printeez', '$'], ['affiliates', 'Affiliates', '$'], ['elitePrice', 'Elite monthly price', '$'], ['eliteChurn', 'Elite monthly cancels', '%'],
    ['dsStart', 'Drop Studio now', '$'], ['dsChurn', 'Drop Studio monthly cancels', '%'], ['dsBase', 'Drop Studio added with no launch', '$'], ['dsPer453Tickets', 'Drop Studio added per 453 tickets', '$'],
  ]],
  ['Costs', [
    ['overhead', 'Monthly overhead', '$'], ['feeRate', 'Processing and refunds', '%'], ['goldApr', 'Gold interest rate', '%'], ['payoutLag', 'Days until sales hit the bank', 'n'], ['jan15Tax', 'Jan 15 tax payment', '$'],
  ]],
]
