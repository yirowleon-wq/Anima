import type { Bridge } from '../shared/types';
declare global {
  interface Window {
    anima: Bridge;
  }
}
