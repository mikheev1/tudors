export type HotspotKind = "scene" | "table" | "zone";

export type HotspotBookingStatus = "available" | "limited" | "waitlist";

export type BookingWorkflowStatus =
  | "submitted"
  | "hold_pending"
  | "payment_pending"
  | "waitlist_joined";

export type VenueVertical =
  | "restaurant"
  | "apartment"
  | "event-space"
  | "office"
  | "villa";

export type VenueAvailability = "available" | "limited" | "busy";

export type VenueSearchFilters = {
  q: string;
  vertical: "all" | VenueVertical;
  type: string;
  availability: "all" | VenueAvailability;
  time: string;
};

export type BrandTheme = {
  id: string;
  name: string;
  shortName: string;
  logoText: string;
  accent: string;
  accentDark: string;
  surfaceTint: string;
};

export type CompanyThemeConfig = {
  id: string;
  name: string;
  logoText: string;
  logoImageUrl?: string;
  accent: string;
  accentDark: string;
  surfaceTint: string;
  panelSurface: string;
  dashboardBackgroundUrl?: string;
  telegramBotName?: string;
  telegramAdminChatId?: string;
  managerReminderLeadMinutes?: number;
  customerReminderLeadMinutes?: number;
};

export type ManagerAccount = {
  id: string;
  companyId: string;
  fullName: string;
  username: string;
  password: string;
  role: "superadmin" | "admin" | "manager";
};

export type ManagerAction = "confirm" | "decline" | "hold" | "waitlist" | "cancel" | "archive" | "restore";

export type ManagerBookingStatus =
  | "new"
  | "hold_pending"
  | "confirmed"
  | "waitlist"
  | "declined";

export type WaitlistEntryStatus = "active" | "contacted" | "resolved" | "cancelled";

export type Hotspot = {
  id: string;
  label: string;
  kind: HotspotKind;
  target?: string;
  x?: number;
  y?: number;
  pitch?: number;
  yaw?: number;
  targetPitch?: number | "same";
  targetYaw?: number | "same";
  heading?: string;
  status?: HotspotBookingStatus;
  capacity?: string;
  deposit?: string;
  minSpend?: string;
  conditions?: string[];
};

export type Scene = {
  id: string;
  title: string;
  description: string;
  image: string;
  panoramaUrl: string;
  previewUrl?: string;
  initialPitch?: number;
  initialYaw?: number;
  initialHfov?: number;
  floorPlanLabel?: string;
  hotspots: Hotspot[];
};

export type Venue = {
  id: string;
  companyId: string;
  ownerManagerId: string;
  name: string;
  vertical: VenueVertical;
  type: string;
  city: string;
  capacity: number;
  price: string;
  summary: string;
  amenities: string[];
  preview: string;
  availability: VenueAvailability;
  timeTags: string[];
  averageBookingLead: string;
  bookingSlots: string[];
  scenes: Scene[];
};

export type BookingRequestPayload = {
  name: string;
  phone: string;
  telegram?: string;
  date: string;
  time: string;
  guests: number;
  venue: string;
  hotspotLabel?: string;
  comment?: string;
};

export type BookingSlotStatus = "available" | "limited" | "unavailable";

export type BookingSlotUnavailableReason = "past" | "occupied" | "blocked";

export type BookingSlot = {
  time: string;
  label: string;
  status: BookingSlotStatus;
  remaining: number;
  unavailableReason?: BookingSlotUnavailableReason;
};

export type ProcessFeedback = {
  status: BookingWorkflowStatus;
  message: string;
  nextAction: string;
  slaLabel: string;
  holdLabel?: string;
};

export type ManagerBooking = {
  id: string;
  companyId: string;
  ownerManagerId?: string;
  customerName: string;
  phone: string;
  telegram?: string;
  venueName: string;
  vertical: VenueVertical;
  placeLabel: string;
  slotLabel?: string;
  dateLabel: string;
  guestsLabel: string;
  amountLabel: string;
  sourceLabel: string;
  managerNote: string;
  status: ManagerBookingStatus;
  archived: boolean;
  eventDateIso?: string;
  startTimeRaw?: string;
};

export type ManagerListing = {
  id: string;
  companyId: string;
  ownerManagerId: string;
  name: string;
  vertical: VenueVertical;
  city: string;
  type: string;
  price: string;
  availability: VenueAvailability;
};

export type ManagerWaitlistEntry = {
  id: string;
  companyId: string;
  venueId: string;
  venueName: string;
  customerName: string;
  customerPhone: string;
  customerTelegram?: string;
  hotspotLabel: string;
  requestedAtLabel: string;
  requestedSlotLabel?: string;
  status: WaitlistEntryStatus;
  note?: string;
  requestedDateIso?: string;
  requestedTimeRaw?: string;
};

export type ManagerReminderItem = {
  id: string;
  companyId: string;
  bookingId?: string;
  venueName: string;
  customerName?: string;
  placeLabel?: string;
  scheduledAtLabel: string;
  message: string;
  status: "pending" | "sent" | "failed";
  channel: string;
  recipientLabel: string;
  scheduledAtIso?: string;
};

export type ManualBookingPayload = {
  venueId: string;
  hotspotLabel: string;
  name: string;
  phone: string;
  telegram?: string;
  date: string;
  time: string;
  guests: number;
  note?: string;
  status?: "NEW" | "HOLD_PENDING" | "CONFIRMED";
};
