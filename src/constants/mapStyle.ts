/**
 * Custom Google Maps style for taxi/ride-hailing apps
 * Optimized for clear pickup/drop-off selection
 * Similar to Uber/Bolt map styling
 */

export const customMapStyle = [
    {
        // Soften water color
        featureType: 'water',
        elementType: 'geometry',
        stylers: [
            {
                color: '#C9E6F2',
            },
        ],
    },
    {
        // Lighten landscape
        featureType: 'landscape',
        elementType: 'geometry',
        stylers: [
            {
                color: '#F5F5F5',
            },
        ],
    },
    {
        // Keep roads visible but softer
        featureType: 'road',
        elementType: 'geometry',
        stylers: [
            {
                color: '#E8E8E8', // Light gray instead of white for better contrast
            },
        ],
    },
    {
        // Road borders
        featureType: 'road',
        elementType: 'geometry.stroke',
        stylers: [
            {
                color: '#E0E0E0',
            },
            {
                weight: 0.5,
            },
        ],
    },
    {
        // Highways more prominent
        featureType: 'road.highway',
        elementType: 'geometry',
        stylers: [
            {
                color: '#FFE6B3',
            },
        ],
    },
    {
        // Highway borders
        featureType: 'road.highway',
        elementType: 'geometry.stroke',
        stylers: [
            {
                color: '#FFCC80',
            },
            {
                weight: 1,
            },
        ],
    },
    {
        // Arterial roads
        featureType: 'road.arterial',
        elementType: 'geometry',
        stylers: [
            {
                color: '#F4F4F4',
            },
        ],
    },
    {
        // Local roads - clearly visible
        featureType: 'road.local',
        elementType: 'geometry',
        stylers: [
            {
                color: '#E0E0E0',
            },
            {
                visibility: 'on',
            },
        ],
    },
    {
        // Keep buildings visible with specific gray for better contrast
        featureType: 'poi.business',
        elementType: 'geometry',
        stylers: [
            {
                color: '#C6C5C3',
            },
        ],
    },
    {
        // Show important POIs (schools, hospitals, etc.)
        featureType: 'poi.school',
        elementType: 'labels.icon',
        stylers: [
            {
                visibility: 'on',
            },
        ],
    },
    {
        featureType: 'poi.medical',
        elementType: 'labels.icon',
        stylers: [
            {
                visibility: 'on',
            },
        ],
    },
    {
        featureType: 'poi.park',
        elementType: 'geometry',
        stylers: [
            {
                color: '#D4E7D4',
            },
        ],
    },
    {
        // Remove transit clutter
        featureType: 'transit',
        elementType: 'labels.icon',
        stylers: [
            {
                visibility: 'off',
            },
        ],
    },
    {
        featureType: 'transit.line',
        stylers: [
            {
                visibility: 'off',
            },
        ],
    },
    {
        // Keep administrative boundaries subtle
        featureType: 'administrative',
        elementType: 'geometry.stroke',
        stylers: [
            {
                color: '#D0D0D0',
            },
            {
                weight: 0.5,
            },
        ],
    },
    {
        // Text labels - keep readable
        featureType: 'poi',
        elementType: 'labels.text.fill',
        stylers: [
            {
                color: '#5A5A5A',
            },
        ],
    },
    {
        featureType: 'road',
        elementType: 'labels.text.fill',
        stylers: [
            {
                color: '#4A4A4A',
            },
        ],
    },
    {
        // Building outlines
        featureType: 'poi.business',
        elementType: 'geometry.stroke',
        stylers: [
            {
                color: '#D0D0D0',
            },
            {
                weight: 0.3,
            },
        ],
    },
];
