// Platform-specific re-export for MapPickerModal
// This file allows TypeScript to resolve the import while Metro handles platform-specific loading
// On web: MapPickerModal.web.tsx is used
// On native: MapPickerModal.native.tsx is used

export { MapPickerModal } from './MapPickerModal.native';
