import { Button } from '@/components/ui';
import type { Location } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface MapPickerModalProps {
    /** Whether the modal is visible */
    visible: boolean;

    /** Initial location (center of map) */
    initialLocation?: Location;

    /** Title for the modal */
    title: string;

    /** Callback when location is confirmed */
    onConfirm: (location: Location) => void;

    /** Callback when modal is closed */
    onClose: () => void;
}

/**
 * Map Picker Modal - Web Version
 * Shows a message that map picker is not available on web
 */
export function MapPickerModal({
    visible,
    initialLocation,
    title,
    onConfirm,
    onClose,
}: MapPickerModalProps) {
    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <View style={styles.header}>
                    <Pressable onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={28} color="#26344F" />
                    </Pressable>
                    <Text style={styles.title}>{title}</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.errorContainer}>
                    <Ionicons name="map-outline" size={64} color="#CBD5E1" />
                    <Text style={styles.errorTitle}>Map Picker Not Available</Text>
                    <Text style={styles.errorText}>
                        Map picker is only available on mobile devices.
                        {'\n'}Please use the search function instead.
                    </Text>
                    <View style={{ marginTop: 24 }}>
                        <Button variant="accent" onPress={onClose}>
                            Close
                        </Button>
                    </View>
                </View>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#E7F1F9',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    closeButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#26344F',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    errorTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#26344F',
        marginTop: 16,
        marginBottom: 8,
    },
    errorText: {
        fontSize: 15,
        color: '#7B8387',
        textAlign: 'center',
        lineHeight: 22,
    },
});
