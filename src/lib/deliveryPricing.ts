/**
 * deliveryPricing.ts — preço de entrega calculado pela distância real
 * loja → cliente (linha recta, fórmula de Haversine).
 *
 * 500 Kz para qualquer ponto até 2 km da loja; acima disso sobe
 * continuamente +200 Kz por km extra (= 100 Kz por cada 500 m).
 */

const FREE_RADIUS_KM = 2
const BASE_FEE = 500
const RATE_PER_KM_BEYOND = 200 // = 100 Kz por cada 500m

/** Distância em linha recta entre dois pontos (km) */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/** Preço de entrega (Kz), arredondado a múltiplos de 10 */
export function calcDeliveryFee(distanceKm: number): number {
  if (distanceKm <= FREE_RADIUS_KM) return BASE_FEE
  const raw = BASE_FEE + (distanceKm - FREE_RADIUS_KM) * RATE_PER_KM_BEYOND
  return Math.round(raw / 10) * 10
}
