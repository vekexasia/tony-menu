/**
 * TypeScript type definitions for the Risto restaurant ordering application.
 * Migrated from Flutter/Dart classes.
 */

// ============================================================================
// Internationalization Types
// ============================================================================

/**
 * i18n map structure for translatable fields.
 * Keys are language codes (e.g., 'it', 'en', 'de', 'ru', 'hu', 'ro'),
 * values are field->translation maps.
 */
export interface I18nMap {
  [language: string]: {
    [field: string]: string;
  };
}

// ============================================================================
// Allergen Types
// ============================================================================

/**
 * Allergen identifiers used in the application.
 * These match the string identifiers stored in Firestore.
 */
export type Allergen =
  | 'Anidride-Solforosa-e-Solfiti'
  | 'Arachidi'
  | 'Crostacei'
  | 'Frutta-a-Guscio'
  | 'Glutine'
  | 'Latte-e-Derivati'
  | 'Lupini'
  | 'Molluschi'
  | 'Pesce'
  | 'Sedano'
  | 'Senape'
  | 'Sesamo'
  | 'Soia'
  | 'Uova';

/**
 * All available allergens as a constant array for iteration.
 */
export const ALLERGENS: Allergen[] = [
  'Anidride-Solforosa-e-Solfiti',
  'Arachidi',
  'Crostacei',
  'Frutta-a-Guscio',
  'Glutine',
  'Latte-e-Derivati',
  'Lupini',
  'Molluschi',
  'Pesce',
  'Sedano',
  'Senape',
  'Sesamo',
  'Soia',
  'Uova',
];

/**
 * Human-readable allergen names (Italian).
 */
export const ALLERGEN_NAMES: Record<Allergen, string> = {
  'Anidride-Solforosa-e-Solfiti': 'Solfiti',
  'Arachidi': 'Arachidi',
  'Crostacei': 'Crostacei',
  'Frutta-a-Guscio': 'Frutta Guscio',
  'Glutine': 'Glutine',
  'Latte-e-Derivati': 'Latte e D.',
  'Lupini': 'Lupini',
  'Molluschi': 'Molluschi',
  'Pesce': 'Pesce',
  'Sedano': 'Sedano',
  'Senape': 'Senape',
  'Sesamo': 'Sesamo',
  'Soia': 'Soia',
  'Uova': 'Uova',
};

// ============================================================================
// Restaurant Theme
// ============================================================================

/**
 * Theme configuration for the restaurant's visual appearance.
 * Corresponds to _RestaurantTheme in Flutter.
 */
export interface RestaurantTheme {
  splashColor?: string;
  primaryColor?: string;
  primarySwatchColor?: string;
  font?: string;
  palette?: string;
}

// ============================================================================
// Restaurant Localization
// ============================================================================

/**
 * Localization settings for the restaurant.
 * Corresponds to _RestaurantLocalization in Flutter.
 */
export interface RestaurantLocalization {
  /** List of supported language codes (default: ['it', 'en', 'de', 'ru', 'hu', 'ro']) */
  supportedLanguages: string[];
  /** Default language code (default: 'it') */
  defaultLanguage: string;
}

// ============================================================================
// Restaurant Messages
// ============================================================================

/**
 * Customizable messages displayed throughout the app.
 * Corresponds to _RestaurantMessages in Flutter.
 */
export interface RestaurantMessages {
  /** Message shown when an order is placed */
  onOrder?: string;
  /** Message about allergens */
  allergens?: string;
  /** Introductory message */
  intro?: string;
  /** Terms and conditions */
  terms?: string;
  /** Message shown when booking is completed */
  onBookingCompleted?: string;
  /** i18n translations for all messages */
  i18n?: I18nMap;
}

// ============================================================================
// Restaurant Socials
// ============================================================================

/**
 * Social media links for the restaurant.
 * Corresponds to _RestaurantSocials in Flutter.
 */
export interface RestaurantSocials {
  /** Facebook page URL or handle */
  facebook?: string;
  /** Instagram handle */
  instagram?: string;
  /** WhatsApp number */
  whatsapp?: string;
}

// ============================================================================
// Restaurant Info
// ============================================================================

/**
 * Geographic coordinates for the restaurant location.
 * Corresponds to GeoPoint in Firestore.
 */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Contact and location information for the restaurant.
 * Corresponds to _RestaurantInfo in Flutter.
 */
export interface MenuNotice {
  /** Show the initial legal/menu notice popup. Defaults to true when missing. */
  enabled?: boolean;
  /** Italian/default notice text. */
  text?: string;
  /** Translations for notice text; field key: text. */
  i18n?: I18nMap;
}

export interface RestaurantInfo {
  /** Phone number */
  phone?: string;
  /** Street address (Firestore key: 'address_line_1') */
  addressLine1?: string;
  /** City name */
  city?: string;
  /** Postal/ZIP code */
  zip?: string;
  /** Region/state/province */
  region?: string;
  /** URL to privacy policy */
  privacyPolicyURL?: string;
  /** Geographic coordinates (Firestore key: 'latlong') */
  latlong?: GeoPoint;
  /** Initial popup shown on the public menu. */
  menuNotice?: MenuNotice;
}

// ============================================================================
// Service Costs
// ============================================================================

/**
 * A service cost tier based on cart value.
 * Corresponds to ServiceCost in Flutter.
 */
export interface ServiceCost {
  /** Minimum cart value for this tier to apply */
  fromCart: number;
  /** Service cost price for this tier */
  price: number;
}

/**
 * Service costs configuration.
 * Corresponds to _ServiceCosts in Flutter.
 */
export interface ServiceCosts {
  /** Service costs for takeaway orders (tiered by cart value) */
  takeaway: ServiceCost[];
}

// ============================================================================
// Promotion Alert
// ============================================================================

/**
 * Promotional alert/banner configuration.
 * Corresponds to PromotionAlert in Flutter.
 */
export interface PromotionAlert {
  /** Title of the promotion */
  title?: string;
  /** Content/description of the promotion */
  content?: string;
  /** URL for more information or action */
  url?: string;
  /** Date until when the promotion is valid */
  tillDate?: string;
}

// ============================================================================
// Opening Schedule Types
// ============================================================================

/**
 * A single time slot (e.g., "11:00" to "14:00").
 * Corresponds to _TimeSlot in Flutter.
 */
export interface TimeSlot {
  /** Start time in HH:MM format */
  start: string;
  /** End time in HH:MM format */
  end: string;
}

/**
 * Working hours configuration for a menu type.
 * Schedule is indexed by weekday (0-6, stored in Firestore as 'schedule.0' through 'schedule.6').
 * Corresponds to WorkingHours in Flutter.
 */
export interface WorkingHours {
  /** Whether this menu type is open at all */
  open: boolean;
  /** Whether booking is allowed */
  bookable?: boolean;
  /** Minimum number of time slots to wait before earliest order */
  minWaitSlot: number;
  /** Duration of each time slot in minutes (default: 15) */
  slotDuration: number;
  /** Maximum days to look ahead for available slots (default: 12) */
  maxDaysLookAhead: number;
  /**
   * Weekly schedule - array of 7 days (index 0-6),
   * each containing an array of time slots for that day.
   * In Firestore stored as 'schedule.0', 'schedule.1', etc.
   */
  schedule: TimeSlot[][];
}

/**
 * Opening schedule. Single restaurant-wide schedule.
 */
export type OpeningSchedule = WorkingHours;

// ============================================================================
// Menu Info Types
// ============================================================================

/**
 * A user-defined menu (Food, Drinks, Lunch, Wine list, ...).
 */
export interface MenuInfo {
  id: string;
  code: string;
  title: string;
  i18n?: I18nMap;
  published: boolean;
  sortOrder: number;
  /** Curated icon kind — see MENU_ICON_KINDS in components/menu/MenuIcon. */
  icon: string;
  availableFrom?: string | null;
  availableTo?: string | null;
}

export interface MenuLabel {
  id: string;
  name: string;
  color: 'primary' | 'green' | 'amber' | 'red' | 'gray';
  sortOrder: number;
  i18n?: Record<string, Record<string, string>> | null;
}

// ============================================================================
// Seat Booking Types
// ============================================================================

/**
 * A zone/area for seat bookings.
 * Corresponds to BaseEntry in Flutter (used for zones).
 */
export interface SeatBookingZone {
  /** Display name of the zone */
  name: string;
  /** Internal code */
  internalCode?: string;
  /** Description */
  desc?: string;
}

/**
 * Seat booking configuration.
 * Corresponds to _SeatBooking in Flutter.
 */
export interface SeatBooking {
  /** Minimum number of persons for a booking */
  minPersons: number;
  /** Maximum number of persons for a booking */
  maxPersons: number;
  /** Available zones/areas for booking */
  zones: SeatBookingZone[];
}

// ============================================================================
// Variant Types
// ============================================================================

/**
 * A single selection option within a variant (e.g., "Small", "Medium", "Large" for size).
 * Corresponds to MenuEntryVariantSelection in Flutter.
 */
export interface VariantSelection {
  /** Display name of this selection option */
  name: string;
  /** Optional description for this selection */
  desc?: string;
  /** Price difference from base price (can be positive, negative, or zero) */
  price: number;
  /** Whether this is the default selection for the variant */
  isDefault: boolean;
  /** i18n translations for this selection */
  i18n?: I18nMap;
}

/**
 * A variant group for a menu entry (e.g., "Size", "Cooking level").
 * Contains multiple selection options, one of which must be chosen.
 * Corresponds to MenuEntryVariant in Flutter.
 */
export interface Variant {
  /** Firestore document ID */
  id: string;
  /** Full Firestore document path */
  path: string;
  /** Display name of the variant group */
  name: string;
  /** Optional description for the variant (stored as 'desc' in Firestore) */
  description?: string;
  /** Display order */
  order: number;
  /** Available selection options within this variant */
  selections: VariantSelection[];
  /** i18n translations for variant name and description */
  i18n?: I18nMap;
}

// ============================================================================
// Extras Types
// ============================================================================

/**
 * Type of extra selection behavior.
 * - 'zeroorone': User can select zero or one item from the extras list
 * - 'zeroormulti': User can select zero or multiple items from the extras list
 * Corresponds to ExtrasType enum in Flutter.
 */
export type ExtrasType = 'zeroorone' | 'zeroormulti';

/**
 * A simple menu entry used as an extra option.
 * Corresponds to SimpleMenuEntry in Flutter.
 */
export interface SimpleMenuEntry {
  /** Display name */
  name: string;
  /** Internal code for the entry */
  internalCode?: string;
  /** Optional description */
  desc?: string;
  /** Price of this extra */
  price: number;
  /** i18n translations */
  i18n?: I18nMap;
}

/**
 * An extras group for a menu entry (e.g., "Toppings", "Sides").
 * Contains multiple extra options that can be added to an order.
 * Corresponds to Extras in Flutter.
 */
export interface Extra {
  /** Firestore document ID */
  id: string;
  /** Full Firestore document path */
  path: string;
  /** Display name of the extras group */
  name: string;
  /** Maximum number of selections allowed (0 = unlimited) */
  max: number;
  /** Selection behavior type */
  type: ExtrasType;
  /** Available extra items in this group */
  extras: SimpleMenuEntry[];
  /** i18n translations for extras group name */
  i18n?: I18nMap;
}

// ============================================================================
// Menu Entry Types
// ============================================================================

/**
 * A single menu item that can be ordered.
 * Corresponds to MenuEntry in Flutter.
 */
export interface MenuEntry {
  /** Firestore document ID */
  id: string;
  /** Full Firestore document path */
  path: string;
  /** Parent category's Firestore document path */
  categoryPath: string;
  /** Display name of the menu item */
  name: string;
  /** Internal code for kitchen/POS systems */
  internalCode?: string;
  /** Optional description (stored as 'desc' in Firestore) */
  description?: string;
  /** Base price of the item */
  price: number;
  /** Unit for price display (e.g., "kg", "portion") */
  priceUnit?: string;
  /** Minimum quantity that must be ordered */
  minQuantity?: number;
  /** URL to the item image */
  image?: string;
  /** Display order within category */
  order: number;
  /** Whether the item is currently out of stock */
  outOfStock: boolean;
  /** Whether the item contains frozen ingredients */
  containsFrozenIngredient: boolean;
  /** IDs of menus this entry appears on. Empty = orphan. */
  menuIds: string[];
  /** Hidden from public catalog (admin-only). */
  hidden: boolean;
  /** Allergens present in this item */
  allergens: Allergen[];
  /** IDs of labels attached to this entry. */
  labelIds?: string[];
  /**
   * Variant document paths that override the category's variants.
   * If null/undefined, inherits from parent category.
   * In Firestore stored as DocumentReference array under 'variants'.
   */
  overriddenVariantPaths?: string[];
  /**
   * Extra document paths that override the category's extras.
   * If null/undefined, inherits from parent category.
   * In Firestore stored as DocumentReference array under 'extras'.
   */
  overriddenExtraPaths?: string[];
  /** i18n translations for name and description */
  i18n?: I18nMap;
}

/**
 * A menu category containing multiple menu entries.
 * Corresponds to MenuEntries in Flutter.
 */
export interface MenuCategory {
  /** Firestore document ID */
  id: string;
  /** Full Firestore document path */
  path: string;
  /** Display name of the category */
  name: string;
  /** Display order */
  order: number;
  /** Menu entries within this category */
  entries: MenuEntry[];
  /** Default variant document paths for entries in this category */
  variantPaths: string[];
  /** Default extra document paths for entries in this category */
  extraPaths: string[];
  /** i18n translations for category name */
  i18n?: I18nMap;
}

// ============================================================================
// Main Restaurant Data Type
// ============================================================================

/**
 * Main restaurant data model containing all configuration and menu data.
 * This is the primary data structure loaded from Firestore.
 * Corresponds to RestaurantData in Flutter.
 */
export interface RestaurantData {
  /** Firestore document ID */
  id: string;
  /** Restaurant display name */
  name: string;
  /** Tagline/payoff text */
  payoff?: string;
  /** URL to header/banner image */
  headerImage?: string;
  /** UID of the restaurant owner */
  ownerID?: string;
  /** Visual theme configuration */
  theme?: RestaurantTheme;
  /** Contact and location info */
  info?: RestaurantInfo;
  /** Customizable messages */
  messages?: RestaurantMessages;
  /** Social media links */
  socials?: RestaurantSocials;
  /** Current promotion alert */
  promotion?: PromotionAlert;
  /** Opening hours schedule (single, restaurant-wide). */
  openingSchedule?: OpeningSchedule;
  /** All defined menus (Food, Drinks, Lunch, ...) sorted by sortOrder. */
  menus: MenuInfo[];
  /** Custom entry labels (badges) defined for this restaurant. */
  labels?: MenuLabel[];
  /** Menu categories with entries (flat — categories belong to the restaurant). */
  categories: MenuCategory[];
  /** Feature flags for optional restaurant capabilities */
  features?: {
    /** Show the AI menu concierge chat. Defaults to false (hidden) when missing. */
    aiChat?: boolean;
    /** Let diners save local menu selections to show staff. Defaults to false when missing. */
    selection?: boolean;
    /** Primary/source language for menu items. Defaults to 'it'. */
    primaryLocale?: string;
    /** Locales enabled for translation. null/undefined = all enabled. */
    enabledLocales?: string[] | null;
    /** Locales completely disabled (not shown in admin or frontend). */
    disabledLocales?: string[] | null;
    /** Admin-defined custom locales (non-ISO, e.g. Veneto). */
    customLocales?: { code: string; name: string; flagUrl?: string | null }[] | null;
  };
}

// ============================================================================
// User Types
// ============================================================================

/**
 * Base user data structure.
 * Corresponds to BaseUser in Flutter.
 */
export interface BaseUser {
  /** Firebase user UID */
  uid: string;
  /** User's first name */
  name?: string;
  /** User's surname/last name */
  surname?: string;
  /** User's phone number */
  phoneNumber?: string;
}

/**
 * Full user model with additional authentication state.
 * Corresponds to User in Flutter.
 */
export interface User extends BaseUser {
  /** Firebase Cloud Messaging tokens for push notifications */
  fcmTokens: string[];
  /** User's email address (from Firebase Auth) */
  email?: string;
}

// ============================================================================
// Utility Types and Functions
// ============================================================================

/**
 * Helper type for Firestore document references (just the path string in React).
 */
export type DocumentPath = string;

/**
 * Type guard to check if a value is a valid Allergen.
 */
export function isAllergen(value: unknown): value is Allergen {
  return ALLERGENS.includes(value as Allergen);
}

/** Whether an entry is visible to public users on the given menu. */
export function isMenuEntryVisibleOnMenu(entry: MenuEntry, menuId: string): boolean {
  return !entry.hidden && entry.menuIds.includes(menuId);
}

/**
 * Find the applicable service cost based on cart value.
 * Corresponds to ServiceCost.findLastMatching() in Flutter.
 */
export function findApplicableServiceCost(costs: ServiceCost[], cartValue: number): ServiceCost | undefined {
  let result: ServiceCost | undefined;
  for (const cost of costs) {
    if (cost.fromCart <= cartValue) {
      result = cost;
    }
  }
  return result;
}

/**
 * Get the default selection from a variant's selections.
 * Corresponds to MenuEntryVariant.defaultSelection in Flutter.
 */
export function getDefaultVariantSelection(variant: Variant): VariantSelection | undefined {
  return variant.selections.find(s => s.isDefault);
}

