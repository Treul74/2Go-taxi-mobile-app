/**
 * Custom Google Maps style targeting only buildings
 * Targeted color #C6C5C3 for better contrast with land
 */
export const mapStyle = [
    {
        // Disable 3D buildings (extrusions)
        featureType: 'building',
        elementType: 'geometry',
        stylers: [
            {
                visibility: 'off',
            },
        ],
    },
    {
        // 2D building fill for visibility
        featureType: 'poi',
        elementType: 'geometry.fill',
        stylers: [
            {
                color: '#C6C5C3',
            },
        ],
    },
    {
        // Dark black outlines specifically for man-made structures and points of interest
        featureType: 'landscape.man_made',
        elementType: 'geometry.stroke',
        stylers: [
            {
                color: '#000000',
            },
            {
                weight: 1,
            },
        ],
    },
    {
        featureType: 'poi',
        elementType: 'geometry.stroke',
        stylers: [
            {
                color: '#000000',
            },
            {
                weight: 1,
            },
        ],
    },
];
