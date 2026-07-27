/**
 * The five PRD §10 state machines and the engine that drives them.
 * "The contract between backend, mobile and QA."
 */

export * from './core';
export { workOrderMachine } from './work-order';
export { serviceChargeMachine } from './service-charge';
export { bookingMachine } from './booking';
export { sosEventMachine } from './sos-event';
export { marketplaceOrderMachine } from './marketplace-order';
export { ppmMachine } from './ppm';

import { workOrderMachine } from './work-order';
import { serviceChargeMachine } from './service-charge';
import { bookingMachine } from './booking';
import { sosEventMachine } from './sos-event';
import { marketplaceOrderMachine } from './marketplace-order';
import { ppmMachine } from './ppm';

/** Every machine, keyed for the /admin/requirements traceability page. */
export const MACHINES = {
  'work-order': workOrderMachine,
  'service-charge': serviceChargeMachine,
  booking: bookingMachine,
  'sos-event': sosEventMachine,
  'marketplace-order': marketplaceOrderMachine,
  ppm: ppmMachine,
} as const;

export type MachineKey = keyof typeof MACHINES;
