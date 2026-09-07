import { useEffect, useState } from 'react';
import {
  addDocumentToTrip,
  addFlightToTrip,
  createTrip as createTripLib,
  deleteTrip,
  getTrips,
  removeDocumentFromTrip,
  removeFlightFromTrip,
  updateTrip as updateTripLib,
  type Trip,
  type Flight,
  type Document,
} from '@/lib/trips';

/**
 * Hook to manage trips state and operations
 */
export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTrips(getTrips());
    setMounted(true);
  }, []);

  const refresh = () => setTrips(getTrips());

  const createTrip = (trip: Omit<Trip, 'id' | 'voos' | 'documentos' | 'criadoEm' | 'atualizadoEm'>) => {
    const newTrip = createTripLib(trip);
    setTrips(getTrips());
    return newTrip;
  };

  const updateTrip = (id: string, updates: Partial<Trip>) => {
    const updated = updateTripLib(id, updates);
    setTrips(getTrips());
    return updated;
  };

  const remove = (id: string) => {
    const success = deleteTrip(id);
    if (success) setTrips(getTrips());
    return success;
  };

  const addFlight = (tripId: string, flight: Omit<Flight, 'id'>) => {
    const added = addFlightToTrip(tripId, flight);
    refresh();
    return added;
  };

  const removeFlight = (tripId: string, flightId: string) => {
    const success = removeFlightFromTrip(tripId, flightId);
    if (success) refresh();
    return success;
  };

  const addDocument = (tripId: string, doc: Omit<Document, 'id' | 'adicionadoEm'>) => {
    const added = addDocumentToTrip(tripId, doc);
    refresh();
    return added;
  };

  const removeDocument = (tripId: string, docId: string) => {
    const success = removeDocumentFromTrip(tripId, docId);
    if (success) refresh();
    return success;
  };

  return {
    trips,
    createTrip,
    updateTrip,
    deleteTrip: remove,
    addFlight,
    removeFlight,
    addDocument,
    removeDocument,
    refresh,
    mounted,
  };
}
