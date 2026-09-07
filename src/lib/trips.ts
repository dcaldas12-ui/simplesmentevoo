/**
 * Trips management with localStorage persistence
 * Stores user's created trips with flights and documents
 */

export interface Flight {
  id: string;
  companhia: string;
  numeroVoo: string;
  dataPartida: string;
  horaPartida: string;
  horaChegada: string;
  dataRegresso?: string;
  precoTotal: number;
  referencia: string; // booking reference
}

export interface Document {
  id: string;
  nome: string;
  tipo: 'boardingPass' | 'passport' | 'visa' | 'insurance' | 'hotel' | 'other';
  url?: string; // PDF or image URL
  dataExpiracao?: string; // ISO date
  adicionadoEm: number; // timestamp
}

export interface Trip {
  id: string;
  titulo: string;
  origem: string;
  destino: string;
  dataInicio: string; // ISO date
  dataFim: string; // ISO date
  descricao?: string;
  voos: Flight[];
  documentos: Document[];
  criadoEm: number; // timestamp
  atualizadoEm: number; // timestamp
}

const TRIPS_KEY = 'simplesmente-voo-trips';

/**
 * Get all trips sorted by start date (upcoming first)
 */
export function getTrips(): Trip[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(TRIPS_KEY);
    if (!stored) return [];
    const trips = JSON.parse(stored) as Trip[];
    
    return trips.sort((a, b) => 
      new Date(a.dataInicio).getTime() - new Date(b.dataInicio).getTime()
    );
  } catch {
    return [];
  }
}

/**
 * Get a single trip by ID
 */
export function getTripById(id: string): Trip | null {
  const trips = getTrips();
  return trips.find(t => t.id === id) || null;
}

/**
 * Create a new trip
 */
export function createTrip(trip: Omit<Trip, 'id' | 'voos' | 'documentos' | 'criadoEm' | 'atualizadoEm'>): Trip {
  if (typeof window === 'undefined') throw new Error('createTrip: window is not defined');
  
  const now = Date.now();
  const id = `trip-${now}-${Math.random().toString(36).substr(2, 9)}`;
  
  const newTrip: Trip = {
    ...trip,
    id,
    voos: [],
    documentos: [],
    criadoEm: now,
    atualizadoEm: now,
  };
  
  const trips = getTrips();
  const updated = [...trips, newTrip];
  
  localStorage.setItem(TRIPS_KEY, JSON.stringify(updated));
  return newTrip;
}

/**
 * Update a trip
 */
export function updateTrip(id: string, updates: Partial<Trip>): Trip | null {
  if (typeof window === 'undefined') return null;
  
  const trips = getTrips();
  const index = trips.findIndex(t => t.id === id);
  
  if (index === -1) return null;
  
  const updated = {
    ...trips[index],
    ...updates,
    id: trips[index].id, // preserve ID
    criadoEm: trips[index].criadoEm, // preserve creation time
    atualizadoEm: Date.now(),
  };
  
  trips[index] = updated;
  localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
  
  return updated;
}

/**
 * Delete a trip
 */
export function deleteTrip(id: string): boolean {
  if (typeof window === 'undefined') return false;
  
  const trips = getTrips();
  const filtered = trips.filter(t => t.id !== id);
  
  if (filtered.length === trips.length) return false; // trip not found
  
  if (filtered.length === 0) {
    localStorage.removeItem(TRIPS_KEY);
  } else {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(filtered));
  }
  
  return true;
}

/**
 * Add a flight to a trip
 */
export function addFlightToTrip(tripId: string, flight: Omit<Flight, 'id'>): Flight | null {
  const trip = getTripById(tripId);
  if (!trip) return null;
  
  const id = `flight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newFlight: Flight = { ...flight, id };
  
  return updateTrip(tripId, {
    voos: [...trip.voos, newFlight],
  })?.voos.find(f => f.id === id) || null;
}

/**
 * Remove a flight from a trip
 */
export function removeFlightFromTrip(tripId: string, flightId: string): boolean {
  const trip = getTripById(tripId);
  if (!trip) return false;
  
  const updated = updateTrip(tripId, {
    voos: trip.voos.filter(f => f.id !== flightId),
  });
  
  return updated !== null;
}

/**
 * Add a document to a trip
 */
export function addDocumentToTrip(tripId: string, doc: Omit<Document, 'id' | 'adicionadoEm'>): Document | null {
  const trip = getTripById(tripId);
  if (!trip) return null;
  
  const id = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newDoc: Document = {
    ...doc,
    id,
    adicionadoEm: Date.now(),
  };
  
  return updateTrip(tripId, {
    documentos: [...trip.documentos, newDoc],
  })?.documentos.find(d => d.id === id) || null;
}

/**
 * Remove a document from a trip
 */
export function removeDocumentFromTrip(tripId: string, docId: string): boolean {
  const trip = getTripById(tripId);
  if (!trip) return false;
  
  const updated = updateTrip(tripId, {
    documentos: trip.documentos.filter(d => d.id !== docId),
  });
  
  return updated !== null;
}
