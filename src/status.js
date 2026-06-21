export const Status = {
  SLOTS_AVAILABLE: 'SLOTS_AVAILABLE',
  NO_SLOTS: 'NO_SLOTS',
  SITE_DOWN: 'SITE_DOWN',
  IP_BLOCKED: 'IP_BLOCKED',
  ERROR: 'ERROR',
  BOOKING_SUCCESS: 'BOOKING_SUCCESS',
  BOOKING_PENDING: 'BOOKING_PENDING',
};

export const STATUS_LABELS = {
  [Status.SLOTS_AVAILABLE]: 'Citas disponibles',
  [Status.NO_SLOTS]: 'Accesible, sin citas',
  [Status.SITE_DOWN]: 'Sitio caído o inaccesible',
  [Status.IP_BLOCKED]: 'Posible bloqueo por IP',
  [Status.ERROR]: 'Error desconocido',
  [Status.BOOKING_SUCCESS]: 'Cita reservada',
  [Status.BOOKING_PENDING]: 'Reserva enviada (pendiente confirmación)',
};
