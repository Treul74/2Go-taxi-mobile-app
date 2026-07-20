/**
 * Format Address Utility
 * Smart address formatting that prioritizes specific place names and handles Plus Codes intelligently
 */

/**
 * Regex pattern to detect Open Location Code (Plus Code)
 * Format: 4-8 alphanumeric chars + "+" + 2-3 alphanumeric chars
 * Examples: F432+J4C, 8FVC9G8F+5V
 */
const PLUS_CODE_REGEX = /\b[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}\b/g;

/**
 * Common generic location keywords (cities, provinces, countries in Zambia)
 * Used to differentiate specific places from generic locations
 */
const GENERIC_LOCATIONS = [
  // Countries
  'zambia', 'zimbabwe', 'botswana', 'namibia', 'angola', 'tanzania', 'malawi', 'mozambique', 'congo',
  // Zambian Provinces
  'lusaka', 'copperbelt', 'northern', 'southern', 'eastern', 'western', 'north western', 'north-western',
  'luapula', 'muchinga', 'central province', 'southern province', 'northern province',
  // Major Zambian Cities
  'kitwe', 'ndola', 'kabwe', 'chingola', 'mufulira', 'livingstone', 'kasama', 'chipata',
  'solwezi', 'choma', 'mongu', 'mansa', 'mazabuka', 'monze', 'kafue', 'chambishi',
  // Generic terms
  'province', 'district', 'township', 'area', 'region', 'zone',
];

/**
 * Formats a location address for display with smart prioritization
 * 
 * Priority Rules:
 * 1. If a SPECIFIC place name exists (business, landmark, street), show it
 * 2. If no specific place, but generic location exists (city), remove Plus Code and show location
 * 3. If ONLY Plus Code exists (no name), show the Plus Code
 * 4. Fallback to whatever is available
 * 
 * @param address - The raw address string (may include Plus Code and location parts)
 * @returns Formatted address suitable for display
 * 
 * @example
 * formatDisplayAddress("Royal Kutachika Lodge, Zambezi, Zambia") 
 * // Returns: "Royal Kutachika Lodge" (specific place name)
 * 
 * @example
 * formatDisplayAddress("F432+J4C, Zambezi, Zambia")
 * // Returns: "Zambezi, Zambia" (generic location, Plus Code removed)
 * 
 * @example
 * formatDisplayAddress("F432+J4C")
 * // Returns: "F432+J4C" (only Plus Code, keep it)
 */
export function formatDisplayAddress(address: string): string {
  if (!address || typeof address !== 'string') {
    return '';
  }

  const trimmed = address.trim();
  
  // Step 1: Split address into parts (by comma)
  const parts = trimmed
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0);

  if (parts.length === 0) {
    return '';
  }

  // Step 2: Check if address has a Plus Code
  const hasPlusCode = PLUS_CODE_REGEX.test(trimmed);
  
  // Step 3: Extract parts (with and without Plus Code)
  let firstPart = parts[0];
  let remainingParts = parts.slice(1);
  
  // Remove Plus Code from parts for analysis
  const firstPartWithoutPlusCode = firstPart.replace(PLUS_CODE_REGEX, '').trim();
  const allPartsWithoutPlusCode = parts
    .map(part => part.replace(PLUS_CODE_REGEX, '').trim())
    .filter(part => part.length > 0);

  // Step 4: Check if first part is a SPECIFIC place name (not generic)
  const isFirstPartSpecific = isSpecificPlaceName(firstPartWithoutPlusCode);
  
  if (isFirstPartSpecific) {
    // Priority 1: Show specific place name
    return cleanupAddress(firstPartWithoutPlusCode);
  }

  // Step 5: Check if we have generic location parts (city, province, country)
  const hasGenericLocation = allPartsWithoutPlusCode.some(part => 
    part.length > 1 && /[a-zA-Z]{2,}/.test(part)
  );

  if (hasPlusCode && hasGenericLocation) {
    // Priority 2: Has Plus Code + generic location → remove Plus Code, show location
    const locationParts = allPartsWithoutPlusCode.filter(part => part.length > 0);
    return cleanupAddress(locationParts.join(', '));
  }

  if (hasPlusCode && !hasGenericLocation) {
    // Priority 3: Only Plus Code (map pick without name) → show Plus Code
    const plusCodeMatch = trimmed.match(PLUS_CODE_REGEX);
    return plusCodeMatch ? plusCodeMatch[0] : trimmed;
  }

  // Priority 4: Fallback to cleaned address
  return cleanupAddress(trimmed);
}

/**
 * Checks if a string is a SPECIFIC place name (business, landmark, street)
 * rather than a generic location (city, province, country)
 * 
 * A specific place name:
 * - Has 2+ words OR
 * - Contains specific keywords (Lodge, Hotel, Mall, Road, Street, etc.) OR
 * - Is NOT in the generic locations list
 * 
 * @param text - Text to check
 * @returns True if text is a specific place name
 * 
 * @example
 * isSpecificPlaceName("Royal Kutachika Lodge") // true (has multiple words)
 * isSpecificPlaceName("Manda Hill Mall") // true (contains "Mall")
 * isSpecificPlaceName("Cairo Road") // true (contains "Road")
 * isSpecificPlaceName("Lusaka") // false (generic city)
 * isSpecificPlaceName("Zambia") // false (generic country)
 */
function isSpecificPlaceName(text: string): boolean {
  if (!text || text.length < 2) return false;
  
  const lowerText = text.toLowerCase().trim();
  
  // Check if it's a generic location (city, province, country)
  if (GENERIC_LOCATIONS.some(generic => lowerText === generic)) {
    return false;
  }
  
  // Check for specific place indicators
  const specificKeywords = [
    'lodge', 'hotel', 'motel', 'resort', 'inn', 'guesthouse', 'guest house',
    'mall', 'market', 'plaza', 'centre', 'center', 'complex',
    'road', 'street', 'avenue', 'drive', 'lane', 'way', 'boulevard',
    'restaurant', 'cafe', 'bar', 'pub', 'club', 'lounge',
    'hospital', 'clinic', 'pharmacy', 'medical',
    'school', 'college', 'university', 'academy',
    'bank', 'atm', 'bureau', 'office',
    'station', 'terminal', 'airport', 'depot',
    'park', 'garden', 'reserve', 'sanctuary',
    'church', 'mosque', 'temple', 'cathedral',
    'building', 'tower', 'house', 'apartments', 'flats',
  ];
  
  // Has specific keyword?
  if (specificKeywords.some(keyword => lowerText.includes(keyword))) {
    return true;
  }
  
  // Has multiple words (likely a specific place)?
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2) {
    return true;
  }
  
  // Has numbers (likely a street address)?
  if (/\d+/.test(text)) {
    return true;
  }
  
  return false;
}

/**
 * Cleans up an address by:
 * - Removing extra spaces
 * - Removing multiple consecutive commas
 * - Removing leading/trailing commas
 * - Trimming whitespace
 * 
 * @param address - Address to clean
 * @returns Cleaned address
 */
function cleanupAddress(address: string): string {
  return address
    .replace(/\s+/g, ' ')           // Multiple spaces → single space
    .replace(/,+/g, ',')             // Multiple commas → single comma
    .replace(/,\s*,/g, ',')          // ", ," → ","
    .replace(/^\s*,\s*/, '')         // Remove leading comma
    .replace(/\s*,\s*$/, '')         // Remove trailing comma
    .trim();
}

/**
 * Formats a short version of the address (first part only)
 * Useful for labels and compact displays
 * 
 * @param address - The full address
 * @returns First meaningful part of the address
 * 
 * @example
 * formatShortAddress("Royal Kutachika Lodge, Zambezi, Zambia") 
 * // Returns: "Royal Kutachika Lodge"
 * 
 * @example
 * formatShortAddress("Zambezi, Zambia") 
 * // Returns: "Zambezi"
 */
export function formatShortAddress(address: string): string {
  const formatted = formatDisplayAddress(address);
  
  if (!formatted) return '';
  
  // Get the first part (before comma)
  const firstPart = formatted.split(',')[0].trim();
  
  return firstPart || formatted;
}

/**
 * Extracts the Plus Code from an address if present
 * Useful for displaying coordinates when needed
 * 
 * @param address - The address string
 * @returns Plus Code if found, empty string otherwise
 * 
 * @example
 * extractPlusCode("F432+J4C, Zambezi, Zambia")
 * // Returns: "F432+J4C"
 */
export function extractPlusCode(address: string): string {
  if (!address || typeof address !== 'string') {
    return '';
  }
  
  const match = address.match(PLUS_CODE_REGEX);
  return match ? match[0] : '';
}

