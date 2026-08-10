import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapReferencePoint { name: string; lat: number; lng: number }

interface DeliveryMapPickerProps {
  center: { lat: number; lng: number }
  zoom?: number
  marker: { lat: number; lng: number } | null
  onMarkerChange: (lat: number, lng: number) => void
  radiusKm?: number
  referencePoints?: MapReferencePoint[]
  /** Tenta obter o GPS do dispositivo ao montar (só faz sentido para o cliente escolher a sua posição) */
  tryGeolocateOnMount?: boolean
  heightClass?: string
}

// Ícones em divIcon (emoji) — evita o bug clássico dos ícones PNG do Leaflet
// não resolverem corretamente com bundlers como o Vite.
const pinIcon = (emoji: string) => L.divIcon({
  html: `<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">${emoji}</div>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 26],
})
const customerPin = pinIcon('📍')
const referencePin = pinIcon('📌')

function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onMove(e.latlng.lat, e.latlng.lng) })
  return null
}

function RecenterOnChange({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lng], map.getZoom()) }, [lat, lng]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function DeliveryMapPicker({
  center, zoom = 13, marker, onMarkerChange, radiusKm, referencePoints = [],
  tryGeolocateOnMount = false, heightClass = 'h-72',
}: DeliveryMapPickerProps) {
  const [locating, setLocating] = useState(false)
  const geolocateAttempted = useRef(false)

  useEffect(() => {
    if (!tryGeolocateOnMount || geolocateAttempted.current || !('geolocation' in navigator)) return
    geolocateAttempted.current = true
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => { onMarkerChange(pos.coords.latitude, pos.coords.longitude); setLocating(false) },
      () => { setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [tryGeolocateOnMount]) // eslint-disable-line react-hooks/exhaustive-deps

  const position = marker ?? center

  return (
    <div className="space-y-2">
      <div className={`${heightClass} rounded-xl overflow-hidden border border-gray-200 relative z-0`}>
        <MapContainer center={[position.lat, position.lng]} zoom={zoom} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToMove onMove={onMarkerChange} />
          {marker && <RecenterOnChange lat={marker.lat} lng={marker.lng} />}
          {radiusKm && marker && (
            <Circle center={[marker.lat, marker.lng]} radius={radiusKm * 1000} pathOptions={{ color: '#06b6d4', fillOpacity: 0.08 }} />
          )}
          {marker && (
            <Marker
              position={[marker.lat, marker.lng]}
              icon={customerPin}
              draggable
              eventHandlers={{ dragend: e => { const p = (e.target as L.Marker).getLatLng(); onMarkerChange(p.lat, p.lng) } }}
            />
          )}
          {referencePoints.map(r => (
            <Marker key={r.name} position={[r.lat, r.lng]} icon={referencePin} />
          ))}
        </MapContainer>
      </div>
      {locating && <p className="text-xs text-cyan-600">📡 A localizar via GPS…</p>}
      <p className="text-xs text-gray-400">Toque no mapa ou arraste o pino para afinar a localização.</p>
    </div>
  )
}
