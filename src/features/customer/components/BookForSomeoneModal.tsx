import { Button, Input } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface BookForSomeoneModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (contact: { name: string; phone: string }) => void;
    initialValue?: { name: string; phone: string } | null;
}

export function BookForSomeoneModal({
    visible,
    onClose,
    onConfirm,
    initialValue
}: BookForSomeoneModalProps) {
    const [contacts, setContacts] = useState<any[]>([]);
    const [filteredContacts, setFilteredContacts] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedContact, setSelectedContact] = useState<{ id?: string; name: string; phone: string } | null>(
        initialValue ? { name: initialValue.name, phone: initialValue.phone } : null
    );
    const [permissionStatus, setPermissionStatus] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            loadContacts();
        }
    }, [visible]);

    const loadContacts = async () => {
        setLoading(true);
        try {
            const { status } = await Contacts.requestPermissionsAsync();
            setPermissionStatus(status);

            if (status === 'granted') {
                const { data } = await Contacts.getContactsAsync({
                    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
                });

                if (data.length > 0) {
                    const sortedData = data
                        .filter(c => c.name && c.phoneNumbers && c.phoneNumbers.length > 0)
                        .sort((a, b) => a.name.localeCompare(b.name));
                    setContacts(sortedData);
                    setFilteredContacts(sortedData);
                }
            }
        } catch (error) {
            console.error('Error loading contacts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (text: string) => {
        setSearchQuery(text);
        if (text.trim() === '') {
            setFilteredContacts(contacts);
        } else {
            const query = text.toLowerCase();
            const filtered = contacts.filter(contact =>
                contact.name.toLowerCase().includes(query) ||
                contact.phoneNumbers?.some((pn: any) => pn.number?.includes(query))
            );
            setFilteredContacts(filtered);
        }
    };

    const handleSelectContact = (contact: any) => {
        if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) return;

        // Use the first phone number available
        const phoneNumber = contact.phoneNumbers[0].number || '';
        setSelectedContact({
            id: contact.id,
            name: contact.name,
            phone: phoneNumber
        });
    };

    const handleConfirm = () => {
        if (selectedContact) {
            onConfirm({
                name: selectedContact.name,
                phone: selectedContact.phone
            });
            onClose();
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-end bg-black/50">
                <View className="bg-white rounded-t-5xl h-[90%]">
                    {/* Header */}
                    <View className="px-6 pt-6 pb-4 border-b border-gray-100 flex-row items-center justify-between">
                        <Text className="text-primary font-bold text-xl">
                            Book for someone else
                        </Text>
                        <Pressable
                            onPress={onClose}
                            className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
                        >
                            <Ionicons name="close" size={20} color="#26344F" />
                        </Pressable>
                    </View>

                    {/* Search Bar */}
                    <View className="px-6 py-4">
                        <Input
                            placeholder="Search contacts..."
                            value={searchQuery}
                            onChangeText={handleSearch}
                            leftIcon="search-outline"
                            variant="filled"
                        />
                    </View>

                    {/* Contacts List */}
                    <View className="flex-1">
                        {loading ? (
                            <View className="flex-1 items-center justify-center">
                                <ActivityIndicator size="large" color="#FE5035" />
                                <Text className="text-secondary mt-4">Loading contacts...</Text>
                            </View>
                        ) : permissionStatus !== 'granted' ? (
                            <View className="flex-1 items-center justify-center px-10">
                                <Ionicons name="lock-closed-outline" size={64} color="#CBD5E1" />
                                <Text className="text-primary text-lg font-semibold mt-4 text-center">
                                    Contacts Permission Required
                                </Text>
                                <Text className="text-secondary text-center mt-2">
                                    Please enable contacts access in your device settings to select a recipient.
                                </Text>
                                <Button variant="accent" onPress={loadContacts} className="mt-6">
                                    Try Again
                                </Button>
                            </View>
                        ) : filteredContacts.length === 0 ? (
                            <View className="flex-1 items-center justify-center">
                                <Ionicons name="person-outline" size={64} color="#CBD5E1" />
                                <Text className="text-secondary mt-4">No contacts found</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={filteredContacts}
                                keyExtractor={(item) => (item as any).id || Math.random().toString()}
                                renderItem={({ item }) => {
                                    const contact = item as any;
                                    const isSelected = selectedContact?.id === contact.id;

                                    return (
                                        <Pressable
                                            onPress={() => handleSelectContact(item)}
                                            className={`flex-row items-center px-6 py-4 border-b border-gray-50 ${isSelected ? 'bg-primary/5' : ''}`}
                                        >
                                            <View className={`w-12 h-12 rounded-full items-center justify-center ${isSelected ? 'bg-primary' : 'bg-gray-100'}`}>
                                                <Text className={`font-bold text-lg ${isSelected ? 'text-white' : 'text-primary'}`}>
                                                    {contact.name ? contact.name.charAt(0).toUpperCase() : '?'}
                                                </Text>
                                            </View>
                                            <View className="ml-4 flex-1">
                                                <Text className="text-primary font-semibold text-base">
                                                    {contact.name}
                                                </Text>
                                                {contact.phoneNumbers && contact.phoneNumbers.length > 0 && (
                                                    <Text className="text-secondary text-sm">
                                                        {contact.phoneNumbers[0].number}
                                                    </Text>
                                                )}
                                            </View>
                                            {isSelected && (
                                                <Ionicons name="checkmark-circle" size={24} color="#FE5035" />
                                            )}
                                        </Pressable>
                                    );
                                }}
                            />
                        )}
                    </View>

                    {/* Footer with Next Button */}
                    <SafeAreaView edges={['bottom']} className="px-6 py-4 border-t border-gray-100">
                        <Button
                            variant="accent"
                            size="lg"
                            fullWidth
                            onPress={handleConfirm}
                            disabled={!selectedContact}
                            rightIcon="arrow-forward"
                        >
                            Next
                        </Button>
                    </SafeAreaView>
                </View>
            </View>
        </Modal>
    );
}
